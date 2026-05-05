'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Node } from '@/lib/types';


interface Flashcard {
  id: string;
  question: string;
  answer: string;
  nodeId: number;
  nodeName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  // Spaced repetition
  interval: number;      // days until next review
  easeFactor: number;    // multiplier
  nextReview: string;    // ISO date
  reviewCount: number;
  lastReview: string;
}

interface QuizSession {
  cards: Flashcard[];
  currentIndex: number;
  showAnswer: boolean;
  results: { cardId: string; rating: number }[];
  startTime: number;
}

type ViewMode = 'deck' | 'quiz' | 'create' | 'stats';

interface QuizCenterProps {
  nodes: Node[];
  onOpenNode: (node: Node) => void;
  apiUrl: string;
}

export default function QuizCenter({ nodes, onOpenNode, apiUrl }: QuizCenterProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);

  // Load persisted flashcards
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/mindmap/flashcards`);
        if (res.ok) {
          const data = await res.json();
          setCards(data.map((c: any) => ({
            id: String(c.id), question: c.question, answer: c.answer, nodeId: c.node_id,
            nodeName: c.node_name, difficulty: c.difficulty, interval: c.interval_days,
            easeFactor: parseFloat(c.ease_factor), nextReview: c.next_review,
            reviewCount: c.review_count, lastReview: c.last_review,
          })));
        }
      } catch {}
    };
    load();
  }, [apiUrl]);
  
  const [viewMode, setViewMode] = useState<ViewMode>('deck');
  const [session, setSession] = useState<QuizSession | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<Flashcard['difficulty']>('medium');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [nodeSearch, setNodeSearch] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // Get quiz-enabled nodes
  const quizNodes = nodes.filter(n => {
    const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata || {};
    return meta.quizEnabled;
  });

  // Cards due for review today
  const today = new Date().toISOString().split('T')[0];
  const dueCards = cards.filter(c => c.nextReview <= today);
  const masteredCards = cards.filter(c => c.interval >= 21);

  // Filtered nodes for search
  const filteredNodes = nodeSearch
    ? nodes.filter(n => n.name.toLowerCase().includes(nodeSearch.toLowerCase())).slice(0, 15)
    : quizNodes.slice(0, 15);

  // SM-2 Algorithm for spaced repetition
  const calculateNextReview = (card: Flashcard, rating: number): Partial<Flashcard> => {
    // rating: 1 = forgot, 2 = hard, 3 = good, 4 = easy
    let { interval, easeFactor, reviewCount } = card;

    if (rating < 2) {
      // Forgot — reset
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    } else if (rating === 2) {
      // Hard
      interval = Math.max(1, Math.ceil(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === 3) {
      // Good
      if (reviewCount === 0) interval = 1;
      else if (reviewCount === 1) interval = 3;
      else interval = Math.ceil(interval * easeFactor);
    } else {
      // Easy
      if (reviewCount === 0) interval = 3;
      else if (reviewCount === 1) interval = 7;
      else interval = Math.ceil(interval * easeFactor * 1.3);
      easeFactor = easeFactor + 0.15;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);

    return {
      interval,
      easeFactor,
      reviewCount: reviewCount + 1,
      nextReview: nextDate.toISOString().split('T')[0],
      lastReview: today,
    };
  };

  // Create card manually
  const handleCreateCard = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    const node = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
    const data = {
      question: newQuestion.trim(), answer: newAnswer.trim(), nodeId: selectedNodeId || 0,
      nodeName: node?.name || 'Unlinked', difficulty: newDifficulty,
      interval: 0, easeFactor: 2.5, nextReview: today, reviewCount: 0, lastReview: null,
    };
    try {
      const res = await fetch(`${apiUrl}/api/mindmap/flashcards`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (res.ok) {
        const saved = await res.json();
        setCards(prev => [...prev, { ...data, id: String(saved.id), lastReview: '' } as Flashcard]);
      }
    } catch {
      setCards(prev => [...prev, { ...data, id: `fc-${Date.now()}`, lastReview: '' } as Flashcard]);
    }
    setNewQuestion(''); setNewAnswer(''); setSelectedNodeId(null); setShowCreateForm(false);
  };

  // Generate cards from node via MindsDB
  const generateFromNode = async (node: Node) => {
    setBulkGenerating(true);
    try {
      const res = await fetch(`${apiUrl}/api/mindmap/node/${node.id}/quiz`);
      if (res.ok) {
        const data = await res.json();
        // Parse AI response into Q&A pairs
        const text = data?.data?.[0]?.answer || data?.answer || '';
        const pairs = parseQAPairs(text);
        const newCards: Flashcard[] = pairs.map((pair, i) => ({
          id: `fc-ai-${node.id}-${Date.now()}-${i}`,
          question: pair.q,
          answer: pair.a,
          nodeId: node.id,
          nodeName: node.name,
          difficulty: 'medium',
          interval: 0,
          easeFactor: 2.5,
          nextReview: today,
          reviewCount: 0,
          lastReview: '',
        }));
        setCards(prev => [...prev, ...newCards]);
      }
    } catch (e: any) {
      console.warn('AI quiz generation not available:', e.message);
      // Create a basic card from node content
      setCards(prev => [...prev, {
        id: `fc-basic-${node.id}-${Date.now()}`,
        question: `What do you know about "${node.name}"?`,
        answer: node.description || 'Review this node for details.',
        nodeId: node.id,
        nodeName: node.name,
        difficulty: 'medium',
        interval: 0,
        easeFactor: 2.5,
        nextReview: today,
        reviewCount: 0,
        lastReview: '',
      }]);
    }
    setBulkGenerating(false);
  };

  // Parse "Q: ... A: ..." format from AI
  const parseQAPairs = (text: string): { q: string; a: string }[] => {
    const pairs: { q: string; a: string }[] = [];
    const lines = text.split('\n').filter(l => l.trim());
    let currentQ = '';

    for (const line of lines) {
      if (line.match(/^[Qq]\d*[:.]/)) {
        currentQ = line.replace(/^[Qq]\d*[:.]\s*/, '').trim();
      } else if (line.match(/^[Aa]\d*[:.]/)) {
        const a = line.replace(/^[Aa]\d*[:.]\s*/, '').trim();
        if (currentQ && a) {
          pairs.push({ q: currentQ, a });
          currentQ = '';
        }
      }
    }

    return pairs.length > 0 ? pairs : [{ q: text.slice(0, 100), a: text.slice(100, 300) || 'See node for details' }];
  };

  // Start quiz session
  const startQuiz = (cardSet: Flashcard[]) => {
    if (cardSet.length === 0) return;
    const shuffled = [...cardSet].sort(() => Math.random() - 0.5);
    setSession({
      cards: shuffled,
      currentIndex: 0,
      showAnswer: false,
      results: [],
      startTime: Date.now(),
    });
    setViewMode('quiz');
  };

  // Rate card in quiz
  const rateCard = async (rating: number) => {
    if (!session) return;
    const card = session.cards[session.currentIndex];
    const updates = calculateNextReview(card, rating);

    // Persist review
    try {
      await fetch(`${apiUrl}/api/mindmap/flashcards/${card.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      });
    } catch {}

    setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...updates } : c));
    const newResults = [...session.results, { cardId: card.id, rating }];
    if (session.currentIndex + 1 < session.cards.length) {
      setSession({ ...session, currentIndex: session.currentIndex + 1, showAnswer: false, results: newResults });
    } else {
      setSession({ ...session, results: newResults, showAnswer: false });
      setViewMode('stats');
    }
  };

  // Stats calculations
  const getStats = () => {
    if (!session) return null;
    const total = session.results.length;
    const perfect = session.results.filter(r => r.rating >= 3).length;
    const forgot = session.results.filter(r => r.rating === 1).length;
    const duration = Math.round((Date.now() - session.startTime) / 1000);
    return { total, perfect, forgot, duration, accuracy: total > 0 ? Math.round((perfect / total) * 100) : 0 };
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Quiz Center</h2>
          {dueCards.length > 0 && (
            <span style={{ background: '#f59e0b', color: '#000', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {dueCards.length} due
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {viewMode !== 'deck' && (
            <button onClick={() => { setViewMode('deck'); setSession(null); }}
              style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              ← Back to Deck
            </button>
          )}
          <button onClick={() => setShowCreateForm(true)}
            style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            + Create Card
          </button>
        </div>
      </div>

      {/* DECK VIEW */}
      {viewMode === 'deck' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f59e0b', cursor: 'pointer' }}
              onClick={() => startQuiz(dueCards)}>
              <div style={{ color: '#888', fontSize: '12px' }}>Due Today</div>
              <div style={{ color: '#f59e0b', fontSize: '28px', fontWeight: 'bold' }}>{dueCards.length}</div>
              <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>Click to review</div>
            </div>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Total Cards</div>
              <div style={{ color: '#3b82f6', fontSize: '28px', fontWeight: 'bold' }}>{cards.length}</div>
            </div>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #22c55e' }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Mastered</div>
              <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: 'bold' }}>{masteredCards.length}</div>
            </div>
            <div style={{ background: '#2a2a3a', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ color: '#888', fontSize: '12px' }}>Quiz Nodes</div>
              <div style={{ color: '#8b5cf6', fontSize: '28px', fontWeight: 'bold' }}>{quizNodes.length}</div>
            </div>
          </div>

          {/* Quick Start */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <button onClick={() => startQuiz(dueCards)} disabled={dueCards.length === 0}
              style={{ background: dueCards.length > 0 ? '#f59e0b' : '#333', border: 'none', color: dueCards.length > 0 ? '#000' : '#666', padding: '12px 24px', borderRadius: '6px', cursor: dueCards.length > 0 ? 'pointer' : 'default', fontWeight: 'bold' }}>
              Review Due Cards ({dueCards.length})
            </button>
            <button onClick={() => startQuiz(cards)} disabled={cards.length === 0}
              style={{ background: '#333', border: 'none', color: '#ccc', padding: '12px 24px', borderRadius: '6px', cursor: cards.length > 0 ? 'pointer' : 'default' }}>
              Review All ({cards.length})
            </button>
            <button onClick={() => {
              const hard = cards.filter(c => c.easeFactor < 2.0);
              startQuiz(hard);
            }} disabled={cards.filter(c => c.easeFactor < 2.0).length === 0}
              style={{ background: '#333', border: 'none', color: '#ccc', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer' }}>
              Hard Cards Only
            </button>
          </div>

          {/* Quiz-Enabled Nodes */}
          {quizNodes.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', marginBottom: '12px' }}>
                Quiz-Enabled Nodes — Click to generate cards
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {quizNodes.map(node => {
                  const nodeCards = cards.filter(c => c.nodeId === node.id);
                  return (
                    <div key={node.id} style={{
                      background: '#2a2a3a', padding: '12px', borderRadius: '6px',
                      cursor: 'pointer', border: '1px solid #444',
                    }}
                      onClick={() => generateFromNode(node)}
                      onContextMenu={(e) => { e.preventDefault(); onOpenNode(node); }}>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{node.name}</div>
                      <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
                        {nodeCards.length} cards · Right-click to open node
                      </div>
                    </div>
                  );
                })}
              </div>
              {bulkGenerating && (
                <div style={{ color: '#f59e0b', marginTop: '8px', fontSize: '13px' }}>Generating cards...</div>
              )}
            </div>
          )}

          {/* All Cards List */}
          <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', marginBottom: '12px' }}>
            All Cards ({cards.length})
          </h3>
          <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
            {cards.length === 0 && (
              <div style={{ color: '#666', padding: '40px', textAlign: 'center' }}>
                No flashcards yet. Create cards manually or flag nodes for quizzing.
              </div>
            )}
            {cards.map(card => (
              <div key={card.id} style={{
                display: 'flex', alignItems: 'center', padding: '10px 16px',
                borderBottom: '1px solid #333', gap: '12px',
              }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: card.interval >= 21 ? '#22c55e' : card.interval >= 7 ? '#f59e0b' : '#ef4444',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: '13px' }}>{card.question}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {card.nodeName} · Next: {card.nextReview} · Reviews: {card.reviewCount}
                  </div>
                </div>
                <span style={{
                  fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                  background: card.difficulty === 'easy' ? '#22c55e22' : card.difficulty === 'hard' ? '#ef444422' : '#f59e0b22',
                  color: card.difficulty === 'easy' ? '#22c55e' : card.difficulty === 'hard' ? '#ef4444' : '#f59e0b',
                }}>
                  {card.difficulty}
                </span>
                <button onClick={async () => {
                  try { await fetch(`${apiUrl}/api/mindmap/flashcards/${card.id}`, { method: 'DELETE' }); } catch {}
                  setCards(prev => prev.filter(c => c.id !== card.id));
                }}
                  style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QUIZ VIEW */}
      {viewMode === 'quiz' && session && session.currentIndex < session.cards.length && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {/* Progress */}
          <div style={{ width: '100%', maxWidth: '600px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '12px', marginBottom: '6px' }}>
              <span>Card {session.currentIndex + 1} of {session.cards.length}</span>
              <span>{session.cards[session.currentIndex].nodeName}</span>
            </div>
            <div style={{ height: '4px', background: '#333', borderRadius: '2px' }}>
              <div style={{
                height: '100%', borderRadius: '2px', background: '#0070f3',
                width: `${((session.currentIndex + 1) / session.cards.length) * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Card */}
          <div style={{
            width: '100%', maxWidth: '600px', minHeight: '300px',
            background: '#2a2a3a', borderRadius: '12px', padding: '40px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', textAlign: 'center',
            border: '1px solid #444',
          }}>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '16px', textTransform: 'uppercase' }}>
              {session.showAnswer ? 'Answer' : 'Question'}
            </div>
            <div style={{ color: '#fff', fontSize: '20px', lineHeight: 1.5, maxWidth: '500px' }}>
              {session.showAnswer
                ? session.cards[session.currentIndex].answer
                : session.cards[session.currentIndex].question
              }
            </div>
          </div>

          {/* Controls */}
          {!session.showAnswer ? (
            <button onClick={() => setSession({ ...session, showAnswer: true })}
              style={{
                marginTop: '24px', background: '#0070f3', border: 'none', color: '#fff',
                padding: '14px 48px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px',
              }}>
              Show Answer
            </button>
          ) : (
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => rateCard(1)}
                style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                😞 Forgot
              </button>
              <button onClick={() => rateCard(2)}
                style={{ background: '#f59e0b', border: 'none', color: '#000', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                😐 Hard
              </button>
              <button onClick={() => rateCard(3)}
                style={{ background: '#22c55e', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                😊 Good
              </button>
              <button onClick={() => rateCard(4)}
                style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                🤩 Easy
              </button>
            </div>
          )}
        </div>
      )}

      {/* STATS VIEW */}
      {viewMode === 'stats' && session && (() => {
        const stats = getStats();
        if (!stats) return null;
        return (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ color: '#fff', marginBottom: '24px' }}>Session Complete!</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '400px', width: '100%', marginBottom: '32px' }}>
              <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '12px' }}>Accuracy</div>
                <div style={{ color: stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 50 ? '#f59e0b' : '#ef4444', fontSize: '32px', fontWeight: 'bold' }}>
                  {stats.accuracy}%
                </div>
              </div>
              <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '12px' }}>Cards Reviewed</div>
                <div style={{ color: '#3b82f6', fontSize: '32px', fontWeight: 'bold' }}>{stats.total}</div>
              </div>
              <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '12px' }}>Perfect</div>
                <div style={{ color: '#22c55e', fontSize: '32px', fontWeight: 'bold' }}>{stats.perfect}</div>
              </div>
              <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '12px' }}>Time</div>
                <div style={{ color: '#8b5cf6', fontSize: '32px', fontWeight: 'bold' }}>
                  {stats.duration > 60 ? `${Math.floor(stats.duration / 60)}m ${stats.duration % 60}s` : `${stats.duration}s`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setViewMode('deck'); setSession(null); }}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer' }}>
                Back to Deck
              </button>
              <button onClick={() => startQuiz(dueCards)} disabled={dueCards.length === 0}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer' }}>
                Review More ({dueCards.length} due)
              </button>
            </div>
          </div>
        );
      })()}

      {/* CREATE CARD MODAL */}
      {showCreateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setShowCreateForm(false)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Create Flashcard</h3>

            <textarea value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
              placeholder="Question" rows={3}
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px', resize: 'vertical' }} />

            <textarea value={newAnswer} onChange={e => setNewAnswer(e.target.value)}
              placeholder="Answer" rows={3}
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px', resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {(['easy', 'medium', 'hard'] as const).map(d => (
                <button key={d} onClick={() => setNewDifficulty(d)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                    background: newDifficulty === d ? (d === 'easy' ? '#22c55e' : d === 'hard' ? '#ef4444' : '#f59e0b') : '#333',
                    color: '#fff', textTransform: 'capitalize',
                  }}>
                  {d}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>Link to Node (optional)</div>
              <input value={nodeSearch} onChange={e => setNodeSearch(e.target.value)}
                placeholder="Search nodes..."
                style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '4px' }} />
              {filteredNodes.length > 0 && nodeSearch && (
                <div style={{ maxHeight: '120px', overflow: 'auto', background: '#1e1e2e', border: '1px solid #444', borderRadius: '4px' }}>
                  {filteredNodes.map(n => (
                    <div key={n.id}
                      onClick={() => { setSelectedNodeId(n.id); setNodeSearch(n.name); }}
                      style={{
                        padding: '6px 10px', cursor: 'pointer', fontSize: '13px',
                        color: selectedNodeId === n.id ? '#fff' : '#ccc',
                        background: selectedNodeId === n.id ? '#0070f3' : 'transparent',
                      }}>
                      {n.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateForm(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateCard}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}