// ============================================================
// BLOCK LAYOUT — width and side for charts, graphs, equations, embeds
// ============================================================
// Added to those blocks' props. A block narrower than "full" floats
// to one side, so the text blocks after it sit next to it (styles in
// blockLayout.css). Change it from the block's ⠿ menu.
// ============================================================

export const LAYOUT_PROPS = {
  width: { default: 'full' },   // 'full' | '75' | '50' | '33'
  align: { default: 'left' },   // 'left' (text on the right) | 'right' (text on the left) | 'center'
} as const;

export const LAYOUT_WIDTHS = [
  { key: 'full', label: 'Width: full' },
  { key: '75', label: 'Width: ¾' },
  { key: '50', label: 'Width: ½' },
  { key: '33', label: 'Width: ⅓' },
];

export const LAYOUT_ALIGNS = [
  { key: 'left', label: 'Text on the right' },
  { key: 'right', label: 'Text on the left' },
  { key: 'center', label: 'Centered (no text beside)' },
];