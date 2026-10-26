// ============================================================
// LLE (Brice's extension of Wang's LMT) — shared by the Quiz Center
// ============================================================
// 5 levels × 7 representations = 35 cells per concept.
// Every question can be tagged with one cell; a missed answer is
// recorded by the MECHANISM that failed (diagnose the mechanism,
// not the symptom).
// ============================================================

export const LLE_LEVELS = [
  { level: 1, name: 'Meaning', hint: 'What it is, what it means' },
  { level: 2, name: 'Procedure', hint: 'Carry out the steps' },
  { level: 3, name: 'Connection', hint: 'Relate it to other ideas' },
  { level: 4, name: 'Judgment', hint: 'Choose when / which applies; evaluate' },
  { level: 5, name: 'Creation', hint: 'Extend it; build something new with it' },
] as const;

export const LLE_REPS = [
  { rep: 'verbal', name: 'Verbal', hint: 'In words' },
  { rep: 'graphical', name: 'Graphical', hint: 'Graphs, diagrams, pictures' },
  { rep: 'concrete', name: 'Concrete', hint: 'Real objects, examples, numbers' },
  { rep: 'symbolic', name: 'Symbolic', hint: 'Notation, equations' },
  { rep: 'procedural', name: 'Procedural', hint: 'Algorithms, steps' },
  { rep: 'structural', name: 'Structural', hint: 'How the parts fit, the system' },
  { rep: 'intuitive', name: 'Intuitive', hint: 'Feel, estimates, sense-making' },
] as const;

export type LleRep = (typeof LLE_REPS)[number]['rep'];

// What failed when an answer was missed (the 5 levels + a plain slip)
export const MECHANISMS = [
  { key: 'meaning', label: 'Meaning', hint: "Didn't know what it means" },
  { key: 'procedure', label: 'Procedure', hint: "Couldn't carry out the steps" },
  { key: 'connection', label: 'Connection', hint: "Didn't link it to what I know" },
  { key: 'judgment', label: 'Judgment', hint: 'Picked the wrong method / misjudged when it applies' },
  { key: 'creation', label: 'Creation', hint: "Couldn't extend it to a new case" },
  { key: 'slip', label: 'Slip', hint: 'Knew it — careless mistake or recall slip' },
] as const;

export const KIND_INFO: Record<string, { icon: string; name: string }> = {
  recall: { icon: '🃏', name: 'Recall' },
  numeric: { icon: '🔢', name: 'Numeric' },
  explain: { icon: '✍️', name: 'Explain / derive' },
  choice: { icon: '🔘', name: 'Multiple choice' },
};

export const levelName = (l?: number | null) => LLE_LEVELS.find(x => x.level === l)?.name || '';
export const repName = (r?: string | null) => LLE_REPS.find(x => x.rep === r)?.name || '';
export const cellLabel = (l?: number | null, r?: string | null) =>
  l ? `L${l} ${levelName(l)}${r ? ` · ${repName(r)}` : ''}` : r ? repName(r) : '';