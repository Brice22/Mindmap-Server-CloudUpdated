'use client';

// ============================================================
// QUIZ CENTER — flashcards with spaced repetition (SM-2)
// ============================================================
// Where cards come from:
//   - written in Docs: a /flashcard block or a "term :: definition" line
//     (they update when the doc is saved; edit or delete them in the doc)
//   - + Create Card here
//   - AI from a quiz-enabled node (needs MindsDB)
// Decks: every node with cards is a deck; studying a node includes its
// sub-nodes. "🧪 Study this node" in the Inspector opens its deck here.
// Keys while reviewing: Space = show answer, 1 Forgot · 2 Hard · 3 Good · 4 Easy, Esc = stop
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Node } from '@/lib/types';
import MathText from '@/lib/MathText';
import { MECHANISMS, KIND_INFO, cellLabel } from '@/lib/lle';
import QuestionEditor, { type QuizQuestion } from './quiz/QuestionEditor';
import QuestionRunner, { type RevealInfo } from './quiz/QuestionRunner';
import LleChart from './quiz/LleChart';
import SynthesisBox from './quiz/SynthesisBox';
import ExportDialog from './quiz/ExportDialog';
import SuggestionsDialog from './quiz/SuggestionsDialog';
import LleLadder from './quiz/LleLadder';
import LibraryPanel from './quiz/LibraryPanel';
import ChapterReview from './quiz/ChapterReview';
import TodayPanel from './quiz/TodayPanel';
import { metaOf as labelMeta, tagsOf, withDescendants, type Tag } from '@/lib/labels';


interface Flashcard {
  id: string;
  question: string;
  answer: string;
  nodeId: number | null;
  nodeName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  // Spaced repetition
  interval: number;      // days until next review
  easeFactor: number;    // multiplier
  nextReview: string;    // YYYY-MM-DD ('' = new, due now)
  reviewCount: number;
  lastReview: string;
  documentId: number | null;     // written in this doc (edit it there)
  documentTitle: string | null;
  genKey: string | null;         // ✨ made from your map
  // Question generator
  kind: 'recall' | 'numeric' | 'explain' | 'choice';
  lleLevel: number | null;
  lleRep: string | null;
  spec: any;
  solution: string | null;
}

interface QuizSession {
  cards: Flashcard[];
  currentIndex: number;
  showAnswer: boolean;
  reveal: RevealInfo | null;          // right/wrong + suggested rating once the answer is shown
  askMechanism: number | null;        // rating given; waiting for "what failed?"
  shownAt: number; 
  results: { cardId: string; rating: number }[];
  startTime: number;
  title: string;
}

type ViewMode = 'deck' | 'quiz' | 'stats';

interface QuizCenterProps {
  nodes: Node[];
  onOpenNode: (node: Node) => void;
  apiUrl: string;
  focusNodeId?: number | null;     // open with this node's deck selected (from the Inspector)
  onClearFocus?: () => void;
  tags?: Tag[];                    // 🏷 tag decks
  onOpenDocs?: (nodeId: number, docId?: number | null) => void;   // a node's Docs (summaries, LLE notes)
  onNodesChanged?: () => void;     // books/chapters were added → reload the graph's nodes
}

interface DailyInfo {
  settings: { newPerDay: number; dailyMinimum: number };
  answeredToday: number;
  newDoneToday: number;
  streak: number;
  doneToday: boolean;
}

// Today's date where you are (not UTC), as YYYY-MM-DD
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const metaOf = (n: Node): any => (typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {});

const btn: React.CSSProperties = { border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const tile: React.CSSProperties = { background: '#2a2a3a', padding: 16, borderRadius: 8 };

export default function QuizCenter({ nodes, onOpenNode, apiUrl, focusNodeId, onClearFocus, tags = [], onOpenDocs, onNodesChanged }: QuizCenterProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('deck');
  const [session, setSession] = useState<QuizSession | null>(null);
  const [deckId, setDeckId] = useState<number | null>(focusNodeId ?? null);   // selected deck (node)
  const [deckTag, setDeckTag] = useState<string | null>(null);                 // 🏷 or a tag deck
  const [withSubNodes, setWithSubNodes] = useState(true);
   const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [dailySettingsOpen, setDailySettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Tabs: 🧪 Cards · 📚 Library · ✅ Today (remembered in this browser)
  const [tab, setTab] = useState<'cards' | 'library' | 'today'>(() => {
    try { const t = localStorage.getItem('hserver:quizTab'); return t === 'library' || t === 'today' ? t : 'cards'; } catch { return 'cards'; }
  });
  const chooseTab = (t: 'cards' | 'library' | 'today') => { setTab(t); try { localStorage.setItem('hserver:quizTab', t); } catch {} };
  const [ladderNode, setLadderNode] = useState<{ id: number; name: string } | null>(null);       // 🪜 open for this node
  const [reviewing, setReviewing] = useState<{ reviewId: number; chapter: { id: number; name: string } } | null>(null);  // 🔁
  const [studyRefresh, setStudyRefresh] = useState(0);

  // Question editor (new / edit) and the LLE chart
   const [editing, setEditing] = useState<{ card?: Flashcard; preset?: { nodeId?: number | null; lleLevel?: number | null; lleRep?: string | null } } | null>(null);
  const [showChart, setShowChart] = useState(() => { try { return localStorage.getItem('hserver:lleChart') === '1'; } catch { return false; } });
  const [chartRefresh, setChartRefresh] = useState(0);
  const [showExport, setShowExport] = useState(false);   // 📤 Export for AI
  const [showSuggest, setShowSuggest] = useState(false); // ✨ Suggested questions
  const [suggestCount, setSuggestCount] = useState(0);
  const [suggestRefresh, setSuggestRefresh] = useState(0);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [message, setMessage] = useState('');

  // --------------------------------------------------------
  // LOAD
    // --------------------------------------------------------
  const load = useCallback(async () => {
    try {
      // ✨ Cards made from the map catch up with it first (renamed nodes, changed links…)
      await fetch(`${apiUrl}/api/mindmap/quiz/generated/refresh`, { method: 'POST' }).catch(() => {});
      const res = await fetch(`${apiUrl}/api/mindmap/flashcards`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.map((c: any) => ({
          id: String(c.id), question: c.question, answer: c.answer, nodeId: c.node_id ?? null,
          nodeName: c.node_name || 'Unlinked', difficulty: c.difficulty || 'medium', interval: c.interval_days || 0,
          easeFactor: parseFloat(c.ease_factor) || 2.5, nextReview: c.next_review || '',
          reviewCount: c.review_count || 0, lastReview: c.last_review || '',
          documentId: c.document_id ?? null, documentTitle: c.document_title ?? null, genKey: c.gen_key ?? null,
          kind: c.kind || 'recall', lleLevel: c.lle_level ?? null, lleRep: c.lle_rep ?? null,
          spec: c.spec || {}, solution: c.solution ?? null,
        })));
        setChartRefresh(n => n + 1);
      }
    } catch {}
    setLoaded(true);
  }, [apiUrl]);

   useEffect(() => { load(); }, [load]);

  // 🗓 Today's progress (answers logged on the server)
  const loadDaily = useCallback(() => {
    fetch(`${apiUrl}/api/mindmap/quiz/daily`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setDaily(d); }).catch(() => {});
  }, [apiUrl]);
  useEffect(() => {
    const t = setTimeout(loadDaily, viewMode === 'deck' ? 0 : 700);   // after a session: once its last answer is saved
    return () => clearTimeout(t);
  }, [loadDaily, viewMode]);

  const saveDailySettings = async (changes: Partial<DailyInfo['settings']>) => {
    try {
      await fetch(`${apiUrl}/api/mindmap/quiz/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
      });
    } catch {}
    loadDaily();
  };

  // Opened from "🧪 Study this node"
  useEffect(() => {
    if (focusNodeId == null) return;
    setDeckId(focusNodeId);
    setDeckTag(null);
    setViewMode('deck');
    setSession(null);
    onClearFocus?.();
  }, [focusNodeId, onClearFocus]);

  const today = localDate();
  const isDue = (c: Flashcard) => !c.nextReview || c.nextReview <= today;

  // --------------------------------------------------------
  // DECKS (a node + its sub-nodes)
  // --------------------------------------------------------
  const childrenOf = useMemo(() => {
    const map = new Map<string, Node[]>();
    for (const n of nodes) {
      const parent = String(metaOf(n).parent || '').toLowerCase();
      if (!parent) continue;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(n);
    }
    return map;
  }, [nodes]);

  const deckNodeIds = useCallback((id: number): Set<number> => {
    const ids = new Set<number>([id]);
    if (!withSubNodes) return ids;
    const queue = [nodes.find(n => n.id === id)].filter(Boolean) as Node[];
    while (queue.length) {
      const n = queue.shift()!;
      for (const child of childrenOf.get(n.name.toLowerCase()) || []) {
        if (!ids.has(child.id)) { ids.add(child.id); queue.push(child); }
      }
    }
    return ids;
    }, [nodes, childrenOf, withSubNodes]);

  const deckNode = deckId != null ? nodes.find(n => n.id === deckId) : null;
  // The nodes in the chosen deck: a node (+ sub-nodes), every node with a tag (+ sub-nodes), or null = all
  const scopeIds = useMemo<Set<number> | null>(() => {
    if (deckTag) {
      const tagged = nodes.filter(n => tagsOf(n).includes(deckTag)).map(n => n.id);
      return withSubNodes ? withDescendants(nodes, tagged) : new Set(tagged);
       }
    return deckId != null ? deckNodeIds(deckId) : null;
  }, [deckTag, deckId, deckNodeIds, nodes, withSubNodes]);
  const scopeList = useMemo(() => (scopeIds ? Array.from(scopeIds) : null), [scopeIds]);
  // ✨ How many suggested questions wait for this deck
  useEffect(() => {
    if (scopeList && !scopeList.length) { setSuggestCount(0); return; }
    const t = setTimeout(() => {
      fetch(`${apiUrl}/api/mindmap/quiz/suggestions${scopeList ? `?nodeIds=${scopeList.join(',')}` : ''}`)
        .then(r => (r.ok ? r.json() : null)).then(d => setSuggestCount(d?.suggestions?.length || 0)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [apiUrl, scopeList, cards.length, suggestRefresh]);

  const inDeck = useMemo(() => {
    if (!scopeIds) return cards;
    return cards.filter(c => c.nodeId != null && scopeIds.has(c.nodeId));
  }, [cards, scopeIds]);

  const dueCards = inDeck.filter(isDue);
  const masteredCards = inDeck.filter(c => c.interval >= 21);

  // Every node that has cards, with its own counts
  const decks = useMemo(() => {
    const byNode = new Map<number, { total: number; due: number }>();
    for (const c of cards) {
      if (c.nodeId == null) continue;
      const d = byNode.get(c.nodeId) || { total: 0, due: 0 };
      d.total++; if (isDue(c)) d.due++;
      byNode.set(c.nodeId, d);
    }
    return Array.from(byNode.entries())
      .map(([id, counts]) => ({ node: nodes.find(n => n.id === id), id, ...counts }))
      .filter(d => d.node)
      .sort((a, b) => b.due - a.due || a.node!.name.localeCompare(b.node!.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [cards, nodes, today]);

    const quizNodes = nodes.filter(n => metaOf(n).quizEnabled);

  // 🏷 Tag decks: cards on nodes with the tag (and their sub-nodes)
  const tagDecks = useMemo(() => tags.map(t => {
    const ids = withDescendants(nodes, nodes.filter(n => tagsOf(n).includes(t.name)).map(n => n.id));
    const mine = cards.filter(c => c.nodeId != null && ids.has(c.nodeId));
    return { tag: t, total: mine.length, due: mine.filter(isDue).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tags, nodes, cards, today]);

  // --------------------------------------------------------
  // 🗓 DAILY REVIEW
  // --------------------------------------------------------
  const knowledgeRoots = useMemo(() => nodes.filter(n => labelMeta(n).role === 'knowledge').map(n => n.id), [nodes]);
  const dailyPlan = useMemo(() => {
    const ids = knowledgeRoots.length ? withDescendants(nodes, knowledgeRoots) : null;
    const pool = ids ? cards.filter(c => c.nodeId != null && ids.has(c.nodeId)) : cards;
    const settings = daily?.settings || { newPerDay: 30, dailyMinimum: 30 };
    const due = pool.filter(c => c.reviewCount > 0 && isDue(c));
    const newLeft = Math.max(0, settings.newPerDay - (daily?.newDoneToday || 0));
    const fresh = pool.filter(c => c.reviewCount === 0).sort((a, b) => Number(a.id) - Number(b.id)).slice(0, newLeft);
    const chosen = new Set([...due, ...fresh].map(c => c.id));
    // Not enough for today's minimum? Add the weakest (lowest ease, longest since seen)
    const stillNeeded = Math.max(0, settings.dailyMinimum - (daily?.answeredToday || 0) - chosen.size);
    const extra = pool
      .filter(c => !chosen.has(c.id) && c.reviewCount > 0)
      .sort((a, b) => a.easeFactor - b.easeFactor || String(a.lastReview).localeCompare(String(b.lastReview)))
      .slice(0, stillNeeded);
    return { pool, due, fresh, extra, set: [...due, ...fresh, ...extra], usingAll: !ids };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, nodes, knowledgeRoots, daily, today]);

  const listed = search.trim()
    ? inDeck.filter(c => `${c.question} ${c.answer} ${c.nodeName}`.toLowerCase().includes(search.trim().toLowerCase()))
    : inDeck;

  // --------------------------------------------------------
  // SM-2 spaced repetition
  // --------------------------------------------------------
  const calculateNextReview = (card: Flashcard, rating: number): Partial<Flashcard> => {
    // rating: 1 = forgot, 2 = hard, 3 = good, 4 = easy
    let { interval, easeFactor } = card;
    const { reviewCount } = card;

    if (rating < 2) {
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    } else if (rating === 2) {
      interval = Math.max(1, Math.ceil(interval * 1.2));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === 3) {
      if (reviewCount === 0) interval = 1;
      else if (reviewCount === 1) interval = 3;
      else interval = Math.ceil(Math.max(1, interval) * easeFactor);
    } else {
      if (reviewCount === 0) interval = 3;
      else if (reviewCount === 1) interval = 7;
      else interval = Math.ceil(Math.max(1, interval) * easeFactor * 1.3);
      easeFactor = easeFactor + 0.15;
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    return { interval, easeFactor, reviewCount: reviewCount + 1, nextReview: localDate(nextDate), lastReview: today };
  };

  // --------------------------------------------------------
  // CREATE (by hand / AI)
  // --------------------------------------------------------
  const saveCard = async (data: { question: string; answer: string; nodeId: number | null; nodeName: string; difficulty: Flashcard['difficulty'] }) => {
    const body = { ...data, interval: 0, easeFactor: 2.5, nextReview: today, reviewCount: 0, lastReview: null };
    const res = await fetch(`${apiUrl}/api/mindmap/flashcards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(String(res.status));
       return res.json();
  };

  // Parse "Q: ... A: ..." format from AI
  const parseQAPairs = (text: string): { q: string; a: string }[] => {
    const pairs: { q: string; a: string }[] = [];
    let currentQ = '';
    for (const line of text.split('\n').filter(l => l.trim())) {
      if (/^[Qq]\d*[:.]/.test(line)) currentQ = line.replace(/^[Qq]\d*[:.]\s*/, '').trim();
      else if (/^[Aa]\d*[:.]/.test(line)) {
        const a = line.replace(/^[Aa]\d*[:.]\s*/, '').trim();
        if (currentQ && a) { pairs.push({ q: currentQ, a }); currentQ = ''; }
      }
    }
    return pairs;
  };

  // AI cards from a quiz-enabled node (MindsDB) — saved like any other card
  const generateFromNode = async (node: Node) => {
    setBulkGenerating(true);
    setMessage('');
    try {
      const res = await fetch(`${apiUrl}/api/mindmap/node/${node.id}/quiz`);
      const data = res.ok ? await res.json() : null;
      const pairs = parseQAPairs(data?.data?.[0]?.answer || data?.answer || '');
      if (!pairs.length) throw new Error('no cards');
      for (const p of pairs) await saveCard({ question: p.q, answer: p.a, nodeId: node.id, nodeName: node.name, difficulty: 'medium' });
      await load();
      setMessage(`Added ${pairs.length} card(s) to ${node.name}.`);
    } catch {
      setMessage(`AI cards aren't available (MindsDB not reachable). Write cards in ${node.name}'s Docs with /flashcard or "term :: definition".`);
    }
    setBulkGenerating(false);
  };

  // --------------------------------------------------------
  // REVIEW
  // --------------------------------------------------------
   const startQuiz = (cardSet: Flashcard[], title: string) => {
    if (cardSet.length === 0) return;
    const shuffled = [...cardSet].sort(() => Math.random() - 0.5);
    setSession({ cards: shuffled, currentIndex: 0, showAnswer: false, reveal: null, askMechanism: null, shownAt: Date.now(), results: [], startTime: Date.now(), title });
       setViewMode('quiz');
  };

  // A node's questions (with its sub-nodes) as a quiz — from the Library, a review or the ladder
  const quizNode = (nodeId: number, title: string) => {
    const ids = deckNodeIds(nodeId);
    const set = cards.filter(c => c.nodeId != null && ids.has(c.nodeId));
    if (!set.length) { setMessage(`No questions on ${title} yet.`); return; }
    startQuiz(set, title);
  };
  const cardsUnder = (nodeId: number) => { const ids = deckNodeIds(nodeId); return cards.filter(c => c.nodeId != null && ids.has(c.nodeId)); };

  // Log the answer (rating, right/wrong, what failed) and go to the next question
  const finishCard = useCallback((rating: number, mechanism: string | null) => {
    if (!session) return;
    const card = session.cards[session.currentIndex];
    fetch(`${apiUrl}/api/mindmap/quiz/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.id, rating, mechanism,
        correct: session.reveal?.correct ?? rating >= 3,
        seconds: Math.round((Date.now() - session.shownAt) / 1000),
        response: session.reveal?.response || null,
      }),
    }).catch(() => {});
    const results = [...session.results, { cardId: card.id, rating }];
    const next = { showAnswer: false, reveal: null, askMechanism: null, shownAt: Date.now(), results };
    if (session.currentIndex + 1 < session.cards.length) {
      setSession({ ...session, ...next, currentIndex: session.currentIndex + 1 });
    } else {
      setSession({ ...session, ...next });
      setViewMode('stats');
      setChartRefresh(n => n + 1);
    }
  }, [session, apiUrl]);

  const rateCard = useCallback(async (rating: number) => {
    if (!session || session.askMechanism != null) return;
    const card = session.cards[session.currentIndex];
    const updates = calculateNextReview(card, rating);
    fetch(`${apiUrl}/api/mindmap/flashcards/${card.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    }).catch(() => {});
    setCards(prev => prev.map(c => (c.id === card.id ? { ...c, ...updates } : c)));
    // A miss: ask what failed before moving on
    if (rating === 1 || session.reveal?.correct === false) {
      setSession({ ...session, askMechanism: rating });
      return;
    }
    finishCard(rating, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, apiUrl, finishCard]);

  // Keyboard while reviewing
  useEffect(() => {
    if (viewMode !== 'quiz' || !session) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'Escape') { setViewMode('deck'); setSession(null); return; }
      if (session.askMechanism != null) {
        const i = Number(e.key) - 1;
        if (i >= 0 && i < MECHANISMS.length) { e.preventDefault(); finishCard(session.askMechanism, MECHANISMS[i].key); }
        else if (e.key === 'Enter') { e.preventDefault(); finishCard(session.askMechanism, null); }
        return;
      }
      if (session.showAnswer && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); rateCard(Number(e.key)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode, session, rateCard, finishCard]);

  const getStats = () => {
    if (!session) return null;
    const total = session.results.length;
    const perfect = session.results.filter(r => r.rating >= 3).length;
    const forgot = session.results.filter(r => r.rating === 1).length;
    const duration = Math.round((Date.now() - session.startTime) / 1000);
        return { total, perfect, forgot, duration, accuracy: total > 0 ? Math.round((perfect / total) * 100) : 0 };
  };

  const deckTitle = deckTag ? `🏷 ${deckTag}` : deckNode ? deckNode.name : 'All cards';
  const current = session && viewMode === 'quiz' ? session.cards[session.currentIndex] : null;
  const currentNode = current?.nodeId != null ? nodes.find(n => n.id === current.nodeId) : null;

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e', overflow: 'hidden' }}>
      {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Quiz Center</h2>
          {viewMode === 'deck' && (
            <div role="tablist" style={{ display: 'flex', gap: 4, background: '#2a2a3a', borderRadius: 8, padding: 3 }}>
              {([['cards', '🧪 Cards'], ['library', '📚 Library'], ['today', '✅ Today']] as const).map(([k, name]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => chooseTab(k)}
                  style={{ ...btn, padding: '6px 12px', background: tab === k ? '#0070f3' : 'transparent', color: tab === k ? '#fff' : '#aaa' }}>{name}</button>
              ))}
            </div>
          )}
          {dueCards.length > 0 && (
            <span style={{ background: '#f59e0b', color: '#000', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 'bold' }}>
              {dueCards.length} due{deckNode ? ` in ${deckNode.name}` : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
                                   {viewMode !== 'deck' && (
            <button onClick={() => { setViewMode('deck'); setSession(null); }} style={{ ...btn, background: '#333', color: '#ccc' }}>← Back to Deck</button>
          )}
          <button onClick={() => setShowSuggest(true)} title="Questions made from your map — keep the ones you want"
            style={{ ...btn, background: suggestCount ? '#3b2f5c' : '#333', color: suggestCount ? '#e9d5ff' : '#ddd' }}>✨ Suggested{suggestCount ? ` (${suggestCount})` : ''}</button>
          <button onClick={() => setShowExport(true)} title="Your answers + LLE analysis as a report for an AI (Claude) to analyse"
            style={{ ...btn, background: '#333', color: '#ddd' }}>📤 Export for AI</button>
          <button onClick={() => setEditing({ preset: { nodeId: deckId } })}
            style={{ ...btn, background: '#0070f3', color: '#fff' }}>+ New question</button>
        </div>
            </div>

      {/* DECK VIEW */}
      {viewMode === 'deck' && tab === 'cards' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
                    {/* Which deck */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ color: '#888', fontSize: 13 }}>Deck:</span>
            <select value={deckTag ? `tag:${deckTag}` : deckId ?? ''}
              onChange={e => {
                const v = e.target.value;
                if (v.startsWith('tag:')) { setDeckTag(v.slice(4)); setDeckId(null); }
                else { setDeckTag(null); setDeckId(v ? Number(v) : null); }
              }}
              style={{ background: '#2a2a3a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px' }}>
              <option value="">All cards ({cards.length})</option>
              {deckId != null && !decks.some(d => d.id === deckId) && deckNode && <option value={deckId}>{deckNode.name}</option>}
              {tagDecks.length > 0 && (
                <optgroup label="Tags">
                  {tagDecks.map(d => <option key={d.tag.id} value={`tag:${d.tag.name}`}>🏷 {d.tag.name} ({d.total}{d.due ? `, ${d.due} due` : ''})</option>)}
                </optgroup>
              )}
              <optgroup label="Nodes">
                {decks.map(d => <option key={d.id} value={d.id}>{d.node!.name} ({d.total}{d.due ? `, ${d.due} due` : ''})</option>)}
              </optgroup>
            </select>
            {(deckId != null || deckTag) && (
              <>
                <label style={{ color: '#aaa', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input type="checkbox" checked={withSubNodes} onChange={e => setWithSubNodes(e.target.checked)} /> include sub-nodes
                </label>
                {deckNode && <button onClick={() => onOpenNode(deckNode)} style={{ ...btn, padding: '4px 10px', background: '#333', color: '#ccc' }}>Show node</button>}
                {deckNode && <button onClick={() => setLadderNode({ id: deckNode.id, name: deckNode.name })} title="Notes + questions at every LLE level × representation"
                  style={{ ...btn, padding: '4px 10px', background: '#3b2f5c', color: '#e9d5ff' }}>🪜 LLE ladder</button>}
              </>
            )}
                      <button onClick={load} title="Reload cards (after editing Docs)" style={{ ...btn, padding: '4px 10px', background: '#333', color: '#ccc' }}>↻</button>
          </div>

          {/* 🗓 DAILY REVIEW */}
          {(() => {
            const st = daily?.settings || { newPerDay: 30, dailyMinimum: 30 };
            const answered = daily?.answeredToday || 0;
            const pct = Math.min(100, Math.round((answered / Math.max(1, st.dailyMinimum)) * 100));
            const p = dailyPlan;
            return (
              <div style={{ ...tile, marginBottom: 20, border: '1px solid #3b3b55' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>
                      🗓 Daily review {daily?.doneToday && <span style={{ color: '#22c55e', fontSize: 13 }}>· ✅ minimum reached</span>}
                    </div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      {p.set.length
                        ? <>{p.set.length} to do: {p.due.length} due · {p.fresh.length} new{p.extra.length ? ` · ${p.extra.length} weakest (to reach ${st.dailyMinimum})` : ''}</>
                        : p.pool.length ? 'Nothing left for today.' : 'No questions in your Knowledge nodes yet.'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }} title="Days in a row you answered at least the daily minimum">
                    <div style={{ color: '#f97316', fontSize: 22, fontWeight: 'bold' }}>🔥 {daily?.streak ?? 0}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>day streak</div>
                  </div>
                  <button onClick={() => startQuiz(p.set, 'Daily review')} disabled={!p.set.length}
                    style={{ ...btn, padding: '12px 22px', fontWeight: 'bold', background: p.set.length ? '#22c55e' : '#333', color: p.set.length ? '#fff' : '#666', cursor: p.set.length ? 'pointer' : 'default' }}>
                    Start daily review ({p.set.length})
                  </button>
                  <button onClick={() => setDailySettingsOpen(o => !o)} title="Daily review settings" style={{ ...btn, background: '#333', color: '#ccc' }}>⚙</button>
                </div>
                <div style={{ marginTop: 10, height: 6, background: '#333', borderRadius: 3 }} title={`${answered} of ${st.dailyMinimum} answered today`}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: pct >= 100 ? '#22c55e' : '#f59e0b', transition: 'width 0.3s' }} />
                </div>
                <div style={{ color: '#777', fontSize: 11, marginTop: 4 }}>
                  {answered} / {st.dailyMinimum} answered today · {daily?.newDoneToday || 0} / {st.newPerDay} new
                  {p.usingAll && p.pool.length > 0 && <> · <span style={{ color: '#a78bfa' }}>Using all cards — give nodes the 📚 Knowledge role (right-click → 🏷 Role &amp; tags…) to choose what is quizzed daily</span></>}
                </div>
                {dailySettingsOpen && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
                    <label>New questions per day{' '}
                      <input type="number" min={0} max={500} defaultValue={st.newPerDay} key={`n${st.newPerDay}`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== st.newPerDay) saveDailySettings({ newPerDay: v }); }}
                        style={{ width: 64, background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '3px 6px' }} />
                    </label>
                    <label>Daily minimum (answers){' '}
                      <input type="number" min={0} max={500} defaultValue={st.dailyMinimum} key={`m${st.dailyMinimum}`}
                        onBlur={e => { const v = Number(e.target.value); if (v !== st.dailyMinimum) saveDailySettings({ dailyMinimum: v }); }}
                        style={{ width: 64, background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '3px 6px' }} />
                    </label>
                    <span style={{ color: '#666' }}>Saved when you click away.</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ ...tile, borderLeft: '4px solid #f59e0b', cursor: dueCards.length ? 'pointer' : 'default' }} onClick={() => startQuiz(dueCards, `${deckTitle} — due`)}>
              <div style={{ color: '#888', fontSize: 12 }}>Due today</div>
              <div style={{ color: '#f59e0b', fontSize: 28, fontWeight: 'bold' }}>{dueCards.length}</div>
              <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{dueCards.length ? 'Click to review' : 'All caught up'}</div>
            </div>
            <div style={{ ...tile, borderLeft: '4px solid #3b82f6' }}>
              <div style={{ color: '#888', fontSize: 12 }}>Cards</div>
              <div style={{ color: '#3b82f6', fontSize: 28, fontWeight: 'bold' }}>{inDeck.length}</div>
            </div>
            <div style={{ ...tile, borderLeft: '4px solid #22c55e' }}>
              <div style={{ color: '#888', fontSize: 12 }}>Mastered (21+ days)</div>
              <div style={{ color: '#22c55e', fontSize: 28, fontWeight: 'bold' }}>{masteredCards.length}</div>
            </div>
            <div style={{ ...tile, borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ color: '#888', fontSize: 12 }}>Decks</div>
              <div style={{ color: '#8b5cf6', fontSize: 28, fontWeight: 'bold' }}>{decks.length}</div>
            </div>
          </div>

          {/* Quick start */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            <button onClick={() => startQuiz(dueCards, `${deckTitle} — due`)} disabled={!dueCards.length}
              style={{ ...btn, padding: '12px 24px', fontWeight: 'bold', background: dueCards.length ? '#f59e0b' : '#333', color: dueCards.length ? '#000' : '#666', cursor: dueCards.length ? 'pointer' : 'default' }}>
              Review due ({dueCards.length})
            </button>
            <button onClick={() => startQuiz(inDeck, `${deckTitle} — practice`)} disabled={!inDeck.length}
              style={{ ...btn, padding: '12px 24px', background: '#333', color: '#ccc' }}>
              Practice all ({inDeck.length})
            </button>
            <button onClick={() => startQuiz(inDeck.filter(c => c.easeFactor < 2.0), `${deckTitle} — hard cards`)} disabled={!inDeck.some(c => c.easeFactor < 2.0)}
              style={{ ...btn, padding: '12px 24px', background: '#333', color: '#ccc' }}>
              Hard cards only
            </button>
          </div>

                   {message && <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 16 }}>{message}</div>}

          {/* 🏷 Tag decks */}
          {deckId == null && !deckTag && tagDecks.some(d => d.total > 0) && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>Tags</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tagDecks.filter(d => d.total > 0).map(d => (
                  <div key={d.tag.id} onClick={() => { setDeckTag(d.tag.name); setDeckId(null); }}
                    style={{ background: '#2a2a3a', padding: '8px 14px', borderRadius: 16, cursor: 'pointer', border: `1px solid ${d.tag.color}` }}>
                    <span style={{ color: d.tag.color, fontWeight: 'bold' }}>● {d.tag.name}</span>
                    <span style={{ color: '#888', fontSize: 11 }}> {d.total}{d.due ? <span style={{ color: '#f59e0b' }}> · {d.due} due</span> : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decks */}
          {deckId == null && !deckTag && decks.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>Decks</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {decks.map(d => (
                  <div key={d.id} onClick={() => setDeckId(d.id)}
                    style={{ background: '#2a2a3a', padding: 12, borderRadius: 6, cursor: 'pointer', border: `1px solid ${d.due ? '#f59e0b55' : '#444'}` }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{d.node!.name}</div>
                    <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                      {d.total} card{d.total === 1 ? '' : 's'}{d.due ? <span style={{ color: '#f59e0b' }}> · {d.due} due</span> : ''}
                    </div>
                  </div>
                ))}
              </div>
                       </div>
          )}

          {/* 🧩 LLE chart for this deck */}
          <div style={{ marginBottom: 24 }}>
            <h3 onClick={() => setShowChart(v => { try { localStorage.setItem('hserver:lleChart', v ? '0' : '1'); } catch {} return !v; })}
                          style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 12, cursor: 'pointer' }}>
              {showChart ? '▾' : '▸'} 🧩 LLE chart — {deckTitle}
            </h3>
            {showChart && scopeIds && scopeIds.size === 0 && <div style={{ color: '#777', fontSize: 13 }}>No nodes in this deck yet.</div>}
            {showChart && !(scopeIds && scopeIds.size === 0) && (
              <LleChart apiUrl={apiUrl} nodeIds={scopeIds ? Array.from(scopeIds) : null} refreshKey={chartRefresh}
                onCell={(lleLevel, lleRep) => setEditing({ preset: { nodeId: deckId, lleLevel, lleRep } })} />
            )}
          </div>

          {/* AI generation (needs MindsDB) */}
          {deckId == null && !deckTag && quizNodes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>Quiz pool — click to make AI cards</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {quizNodes.map(node => (
                  <button key={node.id} onClick={() => generateFromNode(node)} disabled={bulkGenerating}
                    style={{ ...btn, background: '#2a2a3a', color: '#ddd', border: '1px solid #444' }}>✨ {node.name}</button>
                ))}
              </div>
              {bulkGenerating && <div style={{ color: '#f59e0b', marginTop: 8, fontSize: 13 }}>Generating cards…</div>}
            </div>
          )}

          {/* Card list */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', margin: 0 }}>{deckTitle} ({inDeck.length})</h3>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search cards…"
              style={{ background: '#2a2a3a', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 8px', fontSize: 12 }} />
          </div>
                    <div style={{ background: '#2a2a3a', borderRadius: 8, overflow: 'hidden' }}>
            {loaded && listed.length === 0 && (
              <div style={{ color: '#777', padding: 32, textAlign: 'center', fontSize: 13, lineHeight: 1.6 }}>
                {search ? 'No cards match.' : <>No cards yet. In a node's Docs, type <b>/flashcard</b>, or write a line like<br /><code style={{ color: '#c4b5fd' }}>Mitochondria :: makes the cell&apos;s ATP</code><br />or a fill-in-the-blank line like <code style={{ color: '#c4b5fd' }}>{'The mitochondria makes {{ATP}}'}</code><br />— then save the doc. Or open <b>✨ Suggested</b> for questions made from your map.</>}
              </div>
            )}
            {listed.map(card => (
              <div key={card.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #333', gap: 12 }}>
                <div title={isDue(card) ? 'Due' : `Next review ${card.nextReview}`} style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                   background: card.interval >= 21 ? '#22c55e' : card.interval >= 7 ? '#f59e0b' : '#ef4444',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13 }}>
                    <span title={KIND_INFO[card.kind]?.name} style={{ marginRight: 6 }}>{KIND_INFO[card.kind]?.icon}</span>
                    <MathText text={card.question} />
                  </div>
                  <div style={{ color: '#666', fontSize: 11 }}>
                                        {card.lleLevel || card.lleRep ? <span style={{ color: '#a78bfa' }}>{cellLabel(card.lleLevel, card.lleRep)} · </span> : null}
                    {card.nodeName}
                    {card.documentId != null && <> · 📄 {card.documentTitle || 'doc'}</>}
                    {card.genKey && <span title="Made from your map — changes with it"> · ✨ from map</span>}
                    {' · '}{isDue(card) ? <span style={{ color: '#f59e0b' }}>due</span> : `next ${card.nextReview}`}
                    {' · '}reviews {card.reviewCount}
                  </div>
                </div>
                <button onClick={() => setEditing({ card })} title={card.documentId != null ? 'Set format / LLE cell (text is edited in the doc)' : 'Edit'}
                  style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer' }}>✎</button>
                {card.genKey ? (
                  <button onClick={async () => {
                    if (!confirm('Remove this question? It goes to the dismissed list in ✨ Suggested (you can restore it there).')) return;
                    try {
                      await fetch(`${apiUrl}/api/mindmap/quiz/suggestions/dismiss`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: [card.genKey] }),
                      });
                    } catch {}
                    setCards(prev => prev.filter(c => c.id !== card.id));
                  }} title="Remove (dismiss)" style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                ) : card.documentId != null ? (
                  <span title="Written in a doc — edit or delete it there" style={{ color: '#555', fontSize: 11 }}>in doc</span>
                ) : (
                  <button onClick={async () => {
                    if (!confirm('Delete this card?')) return;
                    try { await fetch(`${apiUrl}/api/mindmap/flashcards/${card.id}`, { method: 'DELETE' }); } catch {}
                    setCards(prev => prev.filter(c => c.id !== card.id));
                  }} title="Delete card" style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                )}
              </div>
            ))}
          </div>
               </div>
      )}

      {/* 📚 LIBRARY */}
      {viewMode === 'deck' && tab === 'library' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {message && <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 10 }}>{message}</div>}
          <LibraryPanel apiUrl={apiUrl} today={today} refreshKey={studyRefresh + cards.length}
            onReview={(reviewId, chapter) => setReviewing({ reviewId, chapter })}
            onQuizNode={quizNode}
            onNewQuestion={nodeId => setEditing({ preset: { nodeId } })}
            onLadder={setLadderNode}
            onOpenDocs={(nodeId, docId) => onOpenDocs?.(nodeId, docId)}
            onShowNode={id => { const n = nodes.find(x => x.id === id); if (n) onOpenNode(n); }}
            onNodesChanged={() => onNodesChanged?.()} />
        </div>
      )}

      {/* ✅ TODAY */}
      {viewMode === 'deck' && tab === 'today' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <TodayPanel apiUrl={apiUrl} today={today} refreshKey={studyRefresh}
            daily={{
              count: dailyPlan.set.length, due: dailyPlan.due.length, fresh: dailyPlan.fresh.length, extra: dailyPlan.extra.length,
              answered: daily?.answeredToday || 0, minimum: daily?.settings.dailyMinimum ?? 30, streak: daily?.streak || 0,
            }}
            onStartDaily={() => startQuiz(dailyPlan.set, 'Daily review')}
            onReview={(reviewId, chapter) => setReviewing({ reviewId, chapter })} />
        </div>
      )}

            {/* QUIZ VIEW */}
      {current && session && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflow: 'auto', paddingTop: 16, paddingBottom: 24 }}>
          <div style={{ width: '100%', maxWidth: 640, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 12, marginBottom: 6 }}>
              <span>{session.title} · card {session.currentIndex + 1} of {session.cards.length}</span>
              <span>{current.nodeName}{current.documentTitle ? ` · 📄 ${current.documentTitle}` : ''}</span>
            </div>
            <div style={{ height: 4, background: '#333', borderRadius: 2 }}>
              <div style={{ height: '100%', borderRadius: 2, background: '#0070f3', width: `${((session.currentIndex + 1) / session.cards.length) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
          </div>

          <QuestionRunner q={current as unknown as QuizQuestion} revealed={session.showAnswer}
            onReveal={info => setSession(s => (s ? { ...s, showAnswer: true, reveal: info } : s))} />

          {session.showAnswer && currentNode && (
            <button onClick={() => onOpenNode(currentNode)} style={{ ...btn, marginTop: 12, padding: '4px 10px', fontSize: 11, background: '#333', color: '#aaa' }}>
              Show {currentNode.name} on the graph
            </button>
          )}

          {session.showAnswer && session.askMechanism == null && (
            <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { r: 1, label: '😞 Forgot', bg: '#ef4444', fg: '#fff' },
                { r: 2, label: '😐 Hard', bg: '#f59e0b', fg: '#000' },
                { r: 3, label: '😊 Good', bg: '#22c55e', fg: '#fff' },
                { r: 4, label: '🤩 Easy', bg: '#3b82f6', fg: '#fff' },
              ].map(b => (
                <button key={b.r} onClick={() => rateCard(b.r)}
                  style={{ ...btn, background: b.bg, color: b.fg, padding: '12px 24px', fontSize: 14,
                    outline: session.reveal?.suggested === b.r ? '3px solid #fff' : 'none', outlineOffset: 2 }}
                  title={session.reveal?.suggested === b.r ? 'Suggested from your answer' : undefined}>
                  {b.label} <span style={{ opacity: 0.6, fontSize: 11 }}>{b.r}</span>
                </button>
              ))}
            </div>
          )}

          {/* After a miss: which mechanism failed? */}
          {session.askMechanism != null && (
            <div style={{ marginTop: 20, width: '100%', maxWidth: 680 }}>
              <div style={{ color: '#fff', textAlign: 'center', marginBottom: 10 }}>What failed? <span style={{ color: '#888', fontSize: 12 }}>(keys 1–6 · Enter to skip)</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
                {MECHANISMS.map((m, i) => (
                  <button key={m.key} onClick={() => finishCard(session.askMechanism!, m.key)}
                    style={{ ...btn, background: '#2a2a3a', color: '#ddd', border: `1px solid ${current.lleLevel === i + 1 ? '#a78bfa' : '#444'}`, textAlign: 'left', padding: '10px 12px' }}>
                    <b>{i + 1}. {m.label}</b><div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{m.hint}</div>
                  </button>
                ))}
              </div>
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <button onClick={() => finishCard(session.askMechanism!, null)} style={{ ...btn, background: 'none', color: '#888' }}>Skip</button>
              </div>
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
            <h2 style={{ color: '#fff', marginBottom: 24 }}>Session complete!</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 400, width: '100%', marginBottom: 32 }}>
              <div style={{ ...tile, textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: 12 }}>Accuracy</div>
                <div style={{ color: stats.accuracy >= 80 ? '#22c55e' : stats.accuracy >= 50 ? '#f59e0b' : '#ef4444', fontSize: 32, fontWeight: 'bold' }}>{stats.accuracy}%</div>
              </div>
              <div style={{ ...tile, textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: 12 }}>Cards reviewed</div>
                <div style={{ color: '#3b82f6', fontSize: 32, fontWeight: 'bold' }}>{stats.total}</div>
              </div>
              <div style={{ ...tile, textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: 12 }}>Good or easy</div>
                <div style={{ color: '#22c55e', fontSize: 32, fontWeight: 'bold' }}>{stats.perfect}</div>
              </div>
              <div style={{ ...tile, textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: 12 }}>Time</div>
                <div style={{ color: '#8b5cf6', fontSize: 32, fontWeight: 'bold' }}>
                  {stats.duration > 60 ? `${Math.floor(stats.duration / 60)}m ${stats.duration % 60}s` : `${stats.duration}s`}
                              </div>
              </div>
            </div>
            <SynthesisBox apiUrl={apiUrl} nodes={nodes}
              studiedNodeIds={session.cards.map(c => c.nodeId).filter((id): id is number => id != null)} />
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setViewMode('deck'); setSession(null); }} style={{ ...btn, background: '#333', color: '#ccc', padding: '12px 24px' }}>Back to deck</button>
              <button onClick={() => startQuiz(dueCards, `${deckTitle} — due`)} disabled={!dueCards.length}
                style={{ ...btn, background: '#0070f3', color: '#fff', padding: '12px 24px' }}>Review more ({dueCards.length} due)</button>
            </div>
          </div>
                     );
      })()}

           {/* 📤 EXPORT FOR AI */}
      {showExport && (
        <ExportDialog apiUrl={apiUrl} deckTitle={deckTitle}
          deckNodeIds={scopeIds ? Array.from(scopeIds) : null}
                   onClose={() => setShowExport(false)} />
      )}

      {/* 🪜 LLE LADDER */}
      {ladderNode && (
        <LleLadder apiUrl={apiUrl} node={ladderNode} cards={cardsUnder(ladderNode.id)}
          onClose={() => setLadderNode(null)} onChanged={load} onOpenDocs={onOpenDocs}
          onFullEditor={(lleLevel, lleRep) => setEditing({ preset: { nodeId: ladderNode.id, lleLevel, lleRep } })} />
      )}

      {/* 🔁 CHAPTER REVIEW */}
      {reviewing && (
        <ChapterReview apiUrl={apiUrl} reviewId={reviewing.reviewId} chapter={reviewing.chapter} today={today}
          cardCount={cardsUnder(reviewing.chapter.id).length}
          preQuestions={(() => { const n = nodes.find(x => x.id === reviewing.chapter.id); return n ? metaOf(n).chapter?.preQuestions || '' : ''; })()}
          onClose={() => setReviewing(null)} onDone={() => setStudyRefresh(n => n + 1)}
          onQuiz={() => { const ch = reviewing.chapter; setReviewing(null); quizNode(ch.id, ch.name); }}
          onLadder={() => { const ch = reviewing.chapter; setReviewing(null); setLadderNode(ch); }} />
      )}

      {/* ✨ SUGGESTED QUESTIONS */}
      {showSuggest && (
        <SuggestionsDialog apiUrl={apiUrl} deckTitle={deckTitle} nodeIds={scopeList}
          onClose={() => { setShowSuggest(false); setSuggestRefresh(n => n + 1); }} onChanged={load} />
      )}

      {/* NEW / EDIT QUESTION */}
      {editing && (
        <QuestionEditor apiUrl={apiUrl} nodes={nodes}
          existing={editing.card ? (editing.card as unknown as QuizQuestion) : null}
          preset={editing.preset}
          onClose={() => setEditing(null)}
          onSaved={load} />
      )}
    </div>
  );
}