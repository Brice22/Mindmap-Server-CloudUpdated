'use client';

// ============================================================
// NODE FORMULA CONTEXT
// ============================================================
// Lets a math block inside a BlockNote document put its formula
// on the graph node ("Show on node"). NodeWorkspace provides it;
// math blocks read it. Kept in its own file so NodeWorkspace does
// not have to import BlockNote (which is client-only).
// ============================================================

import { createContext } from 'react';

export interface NodeFormulaContextValue {
  formula: string;                           // LaTeX currently shown on the node ('' = none)
  setFormula: (latex: string | null) => void; // null removes it from the node
}

export const NodeFormulaContext = createContext<NodeFormulaContextValue | null>(null);