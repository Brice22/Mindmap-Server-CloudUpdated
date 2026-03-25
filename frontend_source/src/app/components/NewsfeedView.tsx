'use client';

import React, { useState, useEffect } from 'react';

interface NewsSource {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'api';
  apiKey?: string;
  enabled: boolean;
  category: string;
}

interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  category: string;
  date: string;
  read: boolean;
  archived: boolean;
  saved: boolean;
}

const DEFAULT_CATEGORIES = ['All', 'Tech', 'Finance', 'World', 'Science', 'Politics', 'Custom'];

const DEFAULT_SOURCES: NewsSource[] = [
  { id: 'ft', name: 'Financial Times', url: '', type: 'rss', enabled: false, category: 'Finance' },
  { id: 'gn', name: 'Ground News', url: '', type: 'api', enabled: false, category: 'World' },
  { id: 'google', name: 'Google News', url: 'https://news.google.com/rss', type: 'rss', enabled: false, category: 'All' },
  { id: 'hn', name: 'Hacker News', url: 'https://hn.algolia.com/api/v1/search_by_date?tags=front_page', type: 'api', enabled: true, category: 'Tech' },
];

interface NewsfeedViewProps {
  onSaveToMindmap?: (title: string, url: string) => void;
}

export default function NewsfeedView({ onSaveToMindmap }: NewsfeedViewProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [sources, setSources] = useState<NewsSource[]>(DEFAULT_SOURCES);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [viewFilter, setViewFilter] = useState<'unread' | 'saved' | 'archived' | 'all'>('unread');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceType, setNewSourceType] = useState<'rss' | 'api'>('rss');
  const [newSourceCategory, setNewSourceCategory] = useState('Custom');
  const [newSourceApiKey, setNewSourceApiKey] = useState('');

  // Fetch from enabled sources
  useEffect(() => {
    const fetchNews = async () => {
      const hnSource = sources.find(s => s.id === 'hn' && s.enabled);
      if (hnSource) {
        try {
          const res = await fetch(hnSource.url);
          if (res.ok) {
            const data = await res.json();
            const hnArticles: NewsArticle[] = (data.hits || []).slice(0, 30).map((hit: any) => ({
              id: `hn-${hit.objectID}`,
              title: hit.title || 'Untitled',
              description: hit.comment_text?.slice(0, 200) || hit.url || '',
              url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
              source: 'Hacker News',
              category: 'Tech',
              date: hit.created_at || new Date().toISOString(),
              read: false,
              archived: false,
              saved: false,
            }));
            setArticles(prev => {
              const existingIds = new Set(prev.map(a => a.id));
              const newOnes = hnArticles.filter(a => !existingIds.has(a.id));
              return [...newOnes, ...prev];
            });
          }
        } catch (e) {
          console.warn('Failed to fetch Hacker News:', e);
        }
      }
    };
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [sources]);

  const filteredArticles = articles.filter(a => {
    if (viewFilter === 'unread' && (a.read || a.archived)) return false;
    if (viewFilter === 'saved' && !a.saved) return false;
    if (viewFilter === 'archived' && !a.archived) return false;
    if (activeCategory !== 'All' && a.category !== activeCategory) return false;
    return true;
  });

  const unreadCount = articles.filter(a => !a.read && !a.archived).length;

  const markRead = (id: string) => {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const toggleSave = (id: string) => {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, saved: !a.saved } : a));
  };

  const archive = (id: string) => {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, archived: true, read: true } : a));
  };

  const handleAddSource = () => {
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    setSources(prev => [...prev, {
      id: `custom-${Date.now()}`,
      name: newSourceName.trim(),
      url: newSourceUrl.trim(),
      type: newSourceType,
      apiKey: newSourceApiKey || undefined,
      enabled: true,
      category: newSourceCategory,
    }]);
    setNewSourceName(''); setNewSourceUrl(''); setNewSourceApiKey('');
    setShowAddSource(false);
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Newsfeed</h2>
          {unreadCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            ⚙️ Sources
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexShrink: 0 }}>
        {(['unread', 'saved', 'archived', 'all'] as const).map(f => (
          <button key={f} onClick={() => setViewFilter(f)}
            style={{
              background: viewFilter === f ? '#0070f3' : '#333', border: 'none', color: '#fff',
              padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', textTransform: 'capitalize',
            }}>
            {f} {f === 'unread' && unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
        ))}
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {DEFAULT_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            style={{
              background: activeCategory === cat ? '#0070f3' : '#2a2a3a', border: 'none', color: '#fff',
              padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Articles */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredArticles.length === 0 && (
          <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>
            {viewFilter === 'unread' ? 'All caught up!' : 'No articles found'}
          </div>
        )}
        {filteredArticles.map(article => (
          <div key={article.id} style={{
            background: article.read ? '#222233' : '#2a2a3a', padding: '14px 16px',
            borderRadius: '6px', marginBottom: '8px', borderLeft: `3px solid ${article.saved ? '#f59e0b' : article.read ? '#333' : '#0070f3'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <a href={article.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => markRead(article.id)}
                  style={{ color: article.read ? '#888' : '#fff', textDecoration: 'none', fontWeight: article.read ? 'normal' : 'bold', fontSize: '14px' }}>
                  {article.title}
                </a>
                <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>
                  {article.source} · {article.category} · {new Date(article.date).toLocaleDateString()}
                </div>
                {article.description && (
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '6px', lineHeight: '1.4' }}>
                    {article.description.slice(0, 150)}{article.description.length > 150 ? '...' : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button onClick={() => toggleSave(article.id)} title={article.saved ? 'Unsave' : 'Save'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: article.saved ? '#f59e0b' : '#555' }}>
                  {article.saved ? '★' : '☆'}
                </button>
                <button onClick={() => archive(article.id)} title="Archive"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#555' }}>
                  📥
                </button>
                {onSaveToMindmap && (
                  <button onClick={() => { onSaveToMindmap(article.title, article.url); markRead(article.id); }} title="Save to Mindmap"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#555' }}>
                    🔗
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sources Settings Panel */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setShowSettings(false)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '500px', maxHeight: '80vh', overflow: 'auto', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: '#fff', margin: 0 }}>News Sources</h3>
              <button onClick={() => setShowAddSource(true)}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                + Add Source
              </button>
            </div>
            {sources.map(src => (
              <div key={src.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px', borderBottom: '1px solid #333',
              }}>
                <div>
                  <div style={{ color: '#fff', fontSize: '14px' }}>{src.name}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>{src.category} · {src.type.toUpperCase()}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <label style={{ color: '#888', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input type="checkbox" checked={src.enabled}
                      onChange={() => setSources(prev => prev.map(s => s.id === src.id ? { ...s, enabled: !s.enabled } : s))} />
                    Active
                  </label>
                  {src.id.startsWith('custom-') && (
                    <button onClick={() => setSources(prev => prev.filter(s => s.id !== src.id))}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              </div>
            ))}

            {/* Add Source Form */}
            {showAddSource && (
              <div style={{ marginTop: '16px', padding: '16px', background: '#1e1e2e', borderRadius: '8px' }}>
                <h4 style={{ color: '#ccc', marginTop: 0 }}>New Source</h4>
                <input value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="Source Name"
                  style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                <input value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} placeholder="RSS Feed URL or API endpoint"
                  style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select value={newSourceType} onChange={e => setNewSourceType(e.target.value as any)}
                    style={{ flex: 1, background: '#333', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }}>
                    <option value="rss">RSS Feed</option>
                    <option value="api">API</option>
                  </select>
                  <select value={newSourceCategory} onChange={e => setNewSourceCategory(e.target.value)}
                    style={{ flex: 1, background: '#333', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }}>
                    {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {newSourceType === 'api' && (
                  <input value={newSourceApiKey} onChange={e => setNewSourceApiKey(e.target.value)} placeholder="API Key (optional)"
                    style={{ width: '100%', background: '#333', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowAddSource(false)}
                    style={{ background: '#333', border: 'none', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleAddSource}
                    style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSettings(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}