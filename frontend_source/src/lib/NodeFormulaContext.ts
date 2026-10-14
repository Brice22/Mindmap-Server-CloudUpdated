'use client';

// ============================================================
// NODE FORMULA CONTEXT ("Show on node")
// ============================================================
// Lets blocks inside a BlockNote document put something on the
// graph node: a math block's formula, or a table's headers.
// NodeWorkspace provides it; the math block and the table's ⠿ menu
// read it. Kept in its own file so NodeWorkspace does not have to
// import BlockNote (which is client-only).
// ============================================================

import { createContext } from 'react';

export interface NodeTableData {
  headers: string[];
  rows: string[][];
}

export interface NodeFormulaContextValue {
  formula: string;                                    // LaTeX currently shown on the node ('' = none)
  setFormula: (latex: string | null) => void;         // null removes it from the node
  tableData: NodeTableData | null;                    // table currently shown on the node
  setTableData: (table: NodeTableData | null) => void; // null removes it from the node
}

export const NodeFormulaContext = createContext<NodeFormulaContextValue | null>(null);