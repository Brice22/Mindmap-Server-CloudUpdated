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

// ------------------------------------------------------------
// 🪜 LLE LADDER - what to write at every cell (X = the topic)
// ------------------------------------------------------------
// Wang's LMT level each LLE level covers (6 LMT levels → 5 LLE levels)
export const LMT_OF_LEVEL: Record<number, string> = {
  1: 'LMT: Memorize → Understand',
  2: 'LMT: Apply',
  3: 'LMT: Analyze / Synthesize',
  4: 'LMT: Evaluate',
  5: 'LMT: Create',
};

// prompt = what to write or ask; example = a question for that cell (CNC flavour, to show the shape)
export const CELL_PROMPTS: Record<string, { prompt: string; example: string }> = {
  '1:verbal': { prompt: 'Define X in your own words. Every term you use, you can define too.', example: 'What is chip load, in one sentence?' },
  '1:graphical': { prompt: 'Draw or describe the picture of X: what it looks like, how it is drawn.', example: 'Sketch the chip a single flute cuts and label its thickness.' },
  '1:concrete': { prompt: 'Give a real example of X — and a non-example.', example: 'Give a real chip load for a 1/2" 3-flute end mill in 6061, and one that would break it.' },
  '1:symbolic': { prompt: "Write X's notation or formula and say what every symbol means.", example: 'In IPM = RPM × CL × Z, what is each symbol and its unit?' },
  '1:procedural': { prompt: 'Name the steps X involves, in order (no doing yet — just what they are).', example: 'What are the steps to pick speeds and feeds for a new tool?' },
  '1:structural': { prompt: "What are X's parts and how do they fit together?", example: 'Which quantities make up feed rate, and which one depends on the others?' },
  '1:intuitive': { prompt: 'Why does X make sense? Say the core idea in one plain sentence.', example: 'Why does a bigger cutter need a lower RPM for the same surface speed?' },
  '2:verbal': { prompt: 'Explain how to do X, step by step, in words.', example: 'Talk through setting the feed for a slotting cut.' },
  '2:graphical': { prompt: 'Carry out X on a graph or diagram: draw it, read values off it.', example: 'Use the tool-life chart to pick a speed for 45 minutes of life.' },
  '2:concrete': { prompt: 'Do X on a real case with real numbers or materials.', example: 'A 0.375" 4-flute end mill, 6061, 800 SFM, 0.003 CL — RPM and IPM?' },
  '2:symbolic': { prompt: 'Work X symbolically: solve, rearrange, derive, compute.', example: 'Solve the feed formula for chip load.' },
  '2:procedural': { prompt: 'Write the algorithm or checklist for X, then run it once.', example: 'Write the checklist for proving out a new program, then use it.' },
  '2:structural': { prompt: 'At each step of X, which part does what?', example: 'During a pocket cycle, what does each G-code block control?' },
  '2:intuitive': { prompt: "Estimate X's result before working it out, then check.", example: 'Roughly what RPM for a 1" cutter at 500 SFM? Now compute it.' },
  '3:verbal': { prompt: 'How does X relate to what you already know? Compare and contrast.', example: 'How is chip load different from feed per revolution?' },
  '3:graphical': { prompt: "Place X on a map of related ideas — draw the links (use 🔗 links on the graph).", example: 'Draw how speeds, feeds, tool life and finish affect each other.' },
  '3:concrete': { prompt: 'Where does X show up in another field or a real system?', example: 'Where does the same rate × time × geometry idea show up in 3D printing or bioreactors?' },
  '3:symbolic': { prompt: "Translate X between notations, or link its formula to another formula.", example: 'Turn the RPM formula from inches/SFM into metric (m/min, mm).' },
  '3:procedural': { prompt: 'Which other procedures use X, and which does X use?', example: 'Which steps of CAM programming depend on the feeds you chose?' },
  '3:structural': { prompt: 'What depends on X, and what does X depend on?', example: 'If rigidity drops, what changes downstream in your feeds?' },
  '3:intuitive': { prompt: 'Analogy: X is like ___ because ___ (and where the analogy breaks).', example: 'Chip load is like bite size — where does that analogy fail?' },
  '4:verbal': { prompt: 'When should you use X instead of an alternative? Justify it.', example: 'When would you choose climb milling over conventional?' },
  '4:graphical': { prompt: 'Read a graph or diagram and judge whether X applies.', example: 'From this chatter diagram, is this spindle speed stable?' },
  '4:concrete': { prompt: 'Given a messy real case, choose a method and defend it.', example: 'Thin-walled part, long tool, finish matters — what do you change first and why?' },
  '4:symbolic': { prompt: 'Find the error in a worked solution about X.', example: 'This RPM calculation used diameter in mm with SFM — what went wrong?' },
  '4:procedural': { prompt: 'Which steps of X can fail, and how would you catch it?', example: "Where can a first-article check miss a problem, and what's the guard?" },
  '4:structural': { prompt: 'Evaluate a design or system that uses X: strengths and weak points.', example: "Rate this fixture's design for repeatability and chip clearing." },
  '4:intuitive': { prompt: 'Is this result plausible? Sanity-check with units, limits, extremes.', example: 'A 1/8" end mill at 200 IPM in steel — believable? Why not?' },
  '5:verbal': { prompt: 'Teach X: write the explanation for a beginner (Feynman). Spot your gaps.', example: 'Write the 2-minute explanation of speeds and feeds for a new operator.' },
  '5:graphical': { prompt: 'Make a new diagram or visual that explains X better than the book.', example: 'Design a one-page chart that picks a feed from material and tool.' },
  '5:concrete': { prompt: 'Build or design something new that uses X.', example: 'Design a test cut that finds the best chip load for a new material.' },
  '5:symbolic': { prompt: "Extend or generalize X's formula; derive a new case.", example: 'Derive the feed correction for radial chip thinning.' },
  '5:procedural': { prompt: 'Invent a new procedure, or improve the one for X.', example: 'Improve the setup procedure so the first part is right more often.' },
  '5:structural': { prompt: 'Combine X with other ideas into a new system.', example: 'Combine tool-life data and scheduling into a tool-change plan.' },
  '5:intuitive': { prompt: 'Ask a new question about X that nobody gave you — then try it.', example: 'What would happen to feeds on the Moon? Reason it out.' },
};

// All 35 cells in ladder order: L1 Verbal … L5 Intuitive
export const LADDER: { level: number; rep: string }[] =
  [1, 2, 3, 4, 5].flatMap(level => LLE_REPS.map(r => ({ level, rep: r.rep as string })));

// Card markup shown as plain reading text: {{c1::ATP::hint}} → ATP
export const unCloze = (t: string) => String(t || '').replace(/\{\{\s*(?:c\d+\s*::)?([^{}]*?)(?:::[^{}]*)?\}\}/gi, '$1');