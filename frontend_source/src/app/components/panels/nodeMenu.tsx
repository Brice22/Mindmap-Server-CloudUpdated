'use client';

// ============================================================
// BLOCK MENU (the ⠿ handle left of each block)
// ============================================================
// Same items BlockNote shows by default, plus "Show on node" for
// tables: puts the table's header row on the graph node (replaces
// the old Table window). Edit the table later? Open the menu again
// and click "Show on node" to update what the node shows.
// ============================================================

import React, { useContext } from 'react';
import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
  TableRowHeaderItem,
  TableColumnHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtensionState,
} from '@blocknote/react';
import { NodeFormulaContext, type NodeTableData } from '@/lib/NodeFormulaContext';

// Plain text of one table cell (cells hold styled text, links and inline math)
function cellText(cell: any): string {
  const content = Array.isArray(cell) ? cell : cell?.content || [];
  return content.map((ic: any) => {
    if (typeof ic === 'string') return ic;
    if (ic.type === 'text') return ic.text;
    if (ic.type === 'link') return (ic.content || []).map((c: any) => c.text).join('');
    if (ic.type === 'inlineMath') return ic.props.latex;
    return '';
  }).join('');
}

// BlockNote table block → { headers, rows } (first row = headers)
export function tableBlockToData(block: any): NodeTableData | null {
  const rows: string[][] = (block?.content?.rows || []).map((r: any) => (r.cells || []).map(cellText));
  if (rows.length === 0) return null;
  return { headers: rows[0], rows: rows.slice(1) };
}

function ShowTableOnNodeItem() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s: any) => s?.block }) as any;
  const ctx = useContext(NodeFormulaContext);
  if (!ctx || !block || block.type !== 'table') return null;

  const data = tableBlockToData(block);
  const shown = !!data && JSON.stringify(data) === JSON.stringify(ctx.tableData);

  return (
    <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => ctx.setTableData(shown ? null : data)}>
      {shown ? '✓ Shown on node (click to remove)' : 'Show on node'}
    </Components.Generic.Menu.Item>
  );
}

export function NodeDragHandleMenu() {
  const dict = useDictionary();
  return (
    <DragHandleMenu>
      <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
      <BlockColorsItem>{dict.drag_handle.colors_menuitem}</BlockColorsItem>
      <TableRowHeaderItem>{dict.drag_handle.header_row_menuitem}</TableRowHeaderItem>
      <TableColumnHeaderItem>{dict.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
      <ShowTableOnNodeItem />
    </DragHandleMenu>
  );
}