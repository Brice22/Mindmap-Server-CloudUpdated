// ============================================================
// 🏷 LABELS - a node's ROLE (what it is for) and its TAGS (topics)
// ============================================================
// Both live in the node's metadata, so the graph, Quiz Center and
// search see them without extra lookups:
//   metadata.role   one of ROLES below (or none)
//   metadata.tags   ["Bioengineering", "CNC", …]  (colours come from GET /api/mindmap/tags)
//   metadata.lesson { objectives[], lleTargets[{level, rep}], status, audience, order }  (role "lesson")
//   metadata.plan   { audience, description }                                         (role "lessonPlan")
//   metadata.book   { author }                                                        (role "book")
//   metadata.chapter{ number }                                                        (role "chapter")
//
// 📚 Knowledge = quizzed regularly: the 🗓 Daily review in the Quiz Center
// draws from every Knowledge node and its sub-nodes.
// 🗂 Lesson plan = an ordered set of 📄 Lessons (its sub-nodes), for your
// own study or for teaching.
// ============================================================

import type { Node } from './types';

export const ROLES = [
  { key: 'knowledge', icon: '📚', name: 'Knowledge', hint: 'Quizzed regularly in the daily review (with its sub-nodes)' },
  { key: 'lessonPlan', icon: '🗂', name: 'Lesson plan', hint: 'An ordered set of lessons (its sub-nodes with the Lesson role)' },
  { key: 'lesson', icon: '📄', name: 'Lesson', hint: 'One lesson: objectives, LLE targets, status' },
  { key: 'book', icon: '📖', name: 'Book', hint: 'A book you are reading (chapters are its sub-nodes)' },
  { key: 'chapter', icon: '📑', name: 'Chapter', hint: 'A chapter of a book — review it when you finish it' },
  { key: 'goal', icon: '🎯', name: 'Goal', hint: 'Something to reach (works with the 🎯 Goal path)' },
  { key: 'project', icon: '🧩', name: 'Project', hint: 'A project you are building' },
] as const;

export type RoleKey = (typeof ROLES)[number]['key'];

export const LESSON_STATUS = [
  { key: 'draft', name: 'Draft', color: '#6b7280' },
  { key: 'ready', name: 'Ready', color: '#3b82f6' },
  { key: 'studied', name: 'Studied', color: '#22c55e' },
  { key: 'taught', name: 'Taught / recorded', color: '#a855f7' },
] as const;

export interface Tag { id: number; name: string; color: string; nodes?: number }

export interface LessonMeta {
  objectives?: string[];
  lleTargets?: { level: number; rep?: string | null }[];
  status?: string;
  audience?: 'study' | 'teaching';
  order?: number;
}

export const metaOf = (n: Node | null | undefined): any =>
  !n ? {} : typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {};

export const roleOf = (n: Node | null | undefined) => ROLES.find(r => r.key === metaOf(n).role) || null;
export const tagsOf = (n: Node | null | undefined): string[] => {
  const t = metaOf(n).tags;
  return Array.isArray(t) ? t.filter((x: any) => typeof x === 'string') : [];
};

// Sub-nodes are found by name (metadata.parent = the parent's name, any case)
export function childrenMap(nodes: Node[]) {
  const map = new Map<string, Node[]>();
  for (const n of nodes) {
    const parent = String(metaOf(n).parent || '').toLowerCase();
    if (!parent) continue;
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent)!.push(n);
  }
  return map;
}

// These nodes and everything under them
export function withDescendants(nodes: Node[], startIds: Iterable<number>, children = childrenMap(nodes)) {
  const ids = new Set<number>();
  const queue = Array.from(startIds).map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node[];
  for (const n of queue) ids.add(n.id);
  while (queue.length) {
    const n = queue.shift()!;
    for (const c of children.get(n.name.toLowerCase()) || []) {
      if (!ids.has(c.id)) { ids.add(c.id); queue.push(c); }
    }
  }
  return ids;
}

// The lessons of a lesson plan, in order (sub-nodes with the Lesson role; order, then name)
export function lessonsOf(plan: Node, nodes: Node[]) {
  const name = plan.name.toLowerCase();
  return nodes
    .filter(n => String(metaOf(n).parent || '').toLowerCase() === name && metaOf(n).role === 'lesson')
    .sort((a, b) => (Number(metaOf(a).lesson?.order ?? 9999) - Number(metaOf(b).lesson?.order ?? 9999)) || a.name.localeCompare(b.name));
}

// Graph filter values: 'all' · 'role:knowledge' · 'tag:CNC' · or an old node type ('person'…)
export function matchesFilter(n: Node, filter: string) {
  if (!filter || filter === 'all') return true;
  if (filter.startsWith('role:')) return metaOf(n).role === filter.slice(5);
  if (filter.startsWith('tag:')) return tagsOf(n).includes(filter.slice(4));
  return metaOf(n).type === filter;
}

export const TAG_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#94a3b8'];
// First palette colour no tag uses yet (so a new tag never looks like an old one)
export const nextTagColor = (tags: { color: string }[]) =>
  TAG_COLORS.find(c => !tags.some(t => t.color.toLowerCase() === c)) || TAG_COLORS[tags.length % TAG_COLORS.length];