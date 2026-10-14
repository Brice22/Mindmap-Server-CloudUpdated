'use client';

// ============================================================
// CHART + GRAPH BLOCKS FOR BLOCKNOTE (all served from your own server)
// ============================================================
// - Chart block: /chart → bar, line, pie, doughnut or radar chart from a small table
//                (Chart.js). Click "Edit" to change the type, title or data.
// - Graph block: /graph → plot functions like sin(x) or x^2 - 3 (JSXGraph).
//                Drag to pan, scroll to zoom. Click "Edit" to change functions/range.
// Both are saved inside the document JSON as plain text props.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Chart, registerables } from 'chart.js';
import JXG from 'jsxgraph';
import './jsxgraph.css'; // copied from node_modules/jsxgraph/distrib (the package doesn't export its CSS)

Chart.register(...registerables);
Chart.defaults.color = '#cccccc';
Chart.defaults.borderColor = '#333333';

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#eab308', '#14b8a6', '#f472b6'];

const box: React.CSSProperties = { width: '100%', border: '1px solid #333', borderRadius: 6, padding: 8, background: '#16161e' };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#333', color: '#fff' };
const field: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 13, background: '#0f0f14', color: '#e5e5e5',
  border: '1px solid #444', borderRadius: 4, padding: '4px 6px',
};

// Buttons inside a block: preventDefault on mousedown so the editor doesn't steal the click
function BlockButton({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ ...smallBtn, background: primary ? '#0070f3' : '#333' }}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------
// CHART BLOCK (Chart.js)
// ------------------------------------------------------------
// Data format — first row is the header (series names), one row per label:
//   Month, Sales, Costs
//   Jan, 10, 6
//   Feb, 14, 8
// Commas or tabs both work, so you can paste straight from a spreadsheet.
const SAMPLE_DATA = 'Month, Sales, Costs\nJan, 10, 6\nFeb, 14, 8\nMar, 9, 7\nApr, 17, 9';

function parseTable(text: string) {
  const rows = text.trim().split('\n').map(r => r.split(/[,\t]/).map(c => c.trim())).filter(r => r.length > 1);
  if (rows.length < 2) return null;
  const [header, ...body] = rows;
  const labels = body.map(r => r[0]);
  const series = header.slice(1).map((name, i) => ({
    name: name || `Series ${i + 1}`,
    values: body.map(r => Number(r[i + 1]) || 0),
  }));
  return { labels, series };
}

function ChartBlockView({ block, editor }: { block: any; editor: any }) {
  const { chartType, title, data } = block.props as { chartType: string; title: string; data: string };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ chartType, title, data });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parsed = useMemo(() => parseTable(data), [data]);

  useEffect(() => {
    if (editing || !canvasRef.current || !parsed) return;
    const round = chartType === 'pie' || chartType === 'doughnut';
    const chart = new Chart(canvasRef.current, {
      type: chartType as any,
      data: {
        labels: parsed.labels,
        datasets: (round ? parsed.series.slice(0, 1) : parsed.series).map((s, i) => ({
          label: s.name,
          data: s.values,
          backgroundColor: round ? parsed.labels.map((_, j) => COLORS[j % COLORS.length]) : COLORS[i % COLORS.length] + (chartType === 'radar' ? '44' : ''),
          borderColor: round ? '#16161e' : COLORS[i % COLORS.length],
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { title: { display: !!title, text: title } },
      },
    });
    return () => chart.destroy();
  }, [editing, parsed, chartType, title]);

  const finish = () => {
    editor.updateBlock(block, { props: draft });
    setEditing(false);
  };

  return (
    <div style={box}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={draft.chartType} onChange={e => setDraft({ ...draft, chartType: e.target.value })} style={field}>
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="doughnut">Doughnut</option>
              <option value="radar">Radar</option>
            </select>
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Chart title (optional)" style={{ ...field, flex: 1 }} />
          </div>
          <textarea value={draft.data} onChange={e => setDraft({ ...draft, data: e.target.value })}
            rows={Math.max(4, draft.data.split('\n').length + 1)}
            placeholder={'Label, Series 1, Series 2\nA, 1, 2'}
            style={{ ...field, width: '100%', resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: '#777' }}>
            First row = series names. Each next row = label, then numbers. Paste from a spreadsheet works. Pie/doughnut use the first series.
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <BlockButton onClick={() => { setDraft({ chartType, title, data }); setEditing(false); }}>Cancel</BlockButton>
            <BlockButton primary onClick={finish}>Done</BlockButton>
          </div>
        </div>
      ) : (
        <>
          {parsed
            ? <div style={{ position: 'relative', height: 280 }}><canvas ref={canvasRef} /></div>
            : <div style={{ color: '#666', padding: 12 }}>No data yet — click Edit</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <BlockButton onClick={() => { setDraft({ chartType, title, data }); setEditing(true); }}>Edit</BlockButton>
          </div>
        </>
      )}
    </div>
  );
}

export const ChartBlock = createReactBlockSpec(
  {
    type: 'chart',
    propSchema: {
      chartType: { default: 'bar' },
      title: { default: '' },
      data: { default: SAMPLE_DATA },
    },
    content: 'none',
  },
  {
    render: (props) => <ChartBlockView block={props.block} editor={props.editor} />,
  },
);

// ------------------------------------------------------------
// GRAPH BLOCK (JSXGraph) — Desmos-style function plotting
// ------------------------------------------------------------
// One function of x per line, e.g.
//   sin(x)
//   x^2 - 3
//   exp(-x^2)
// Range is "xmin, xmax, ymin, ymax".
function GraphBlockView({ block, editor }: { block: any; editor: any }) {
  const { functions, range } = block.props as { functions: string; range: string };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ functions, range });
  const [error, setError] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing || !boardRef.current) return;
    // JSXGraph draws into a div that React doesn't manage, so React and JSXGraph never fight over the same element
    const el = document.createElement('div');
    el.className = 'jxgbox';
    el.style.cssText = 'width:100%;height:320px;background:#fafafa;border:none;border-radius:4px';
    boardRef.current.appendChild(el);
    const [xmin, xmax, ymin, ymax] = range.split(',').map(n => Number(n.trim()));
    const bbox = [xmin, ymax, xmax, ymin].every(n => Number.isFinite(n)) ? [xmin, ymax, xmax, ymin] : [-10, 10, 10, -10];
    const board = JXG.JSXGraph.initBoard(el, {
      boundingbox: bbox as [number, number, number, number],
      axis: true,
      showCopyright: false,
      showNavigation: true,
      keepAspectRatio: false,
      pan: { enabled: true, needShift: false },
      zoom: { wheel: true, needShift: false },
    } as any);
    setError(null);
    functions.split('\n').map(f => f.trim()).filter(Boolean).forEach((expr, i) => {
      try {
        const fn = (board as any).jc.snippet(expr, true, 'x', true);
        fn(0); // throws now if the expression is invalid
        board.create('functiongraph', [fn], {
          strokeColor: COLORS[i % COLORS.length], strokeWidth: 2,
          withLabel: true, name: expr, label: { strokeColor: COLORS[i % COLORS.length] },
        } as any);
      } catch {
        setError(`Could not read: ${expr}`);
      }
    });
    return () => {
      JXG.JSXGraph.freeBoard(board);
      el.remove();
    };
  }, [editing, functions, range]);

  const finish = () => {
    editor.updateBlock(block, { props: draft });
    setEditing(false);
  };

  return (
    <div style={box}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={draft.functions} onChange={e => setDraft({ ...draft, functions: e.target.value })}
            rows={Math.max(3, draft.functions.split('\n').length + 1)}
            placeholder={'One function of x per line, e.g.\nsin(x)\nx^2 - 3'}
            style={{ ...field, width: '100%', resize: 'vertical' }} />
          <input value={draft.range} onChange={e => setDraft({ ...draft, range: e.target.value })}
            placeholder="xmin, xmax, ymin, ymax" style={field} />
          <div style={{ fontSize: 11, color: '#777' }}>
            Use x as the variable. Works: + - * / ^, sin cos tan sqrt abs exp log, PI. Range = xmin, xmax, ymin, ymax.
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <BlockButton onClick={() => { setDraft({ functions, range }); setEditing(false); }}>Cancel</BlockButton>
            <BlockButton primary onClick={finish}>Done</BlockButton>
          </div>
        </div>
      ) : (
        <>
          {/* JSXGraph adds its board inside this div (light background keeps its default colours readable) */}
          <div ref={boardRef} key="graph-host" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: error ? '#f87171' : '#666' }}>
              {error || 'Drag to pan · scroll to zoom'}
            </span>
            <BlockButton onClick={() => { setDraft({ functions, range }); setEditing(true); }}>Edit</BlockButton>
          </div>
        </>
      )}
    </div>
  );
}

export const GraphBlock = createReactBlockSpec(
  {
    type: 'graph',
    propSchema: {
      functions: { default: 'sin(x)\nx^2 / 4 - 2' },
      range: { default: '-10, 10, -6, 6' },
    },
    content: 'none',
  },
  {
    render: (props) => <GraphBlockView block={props.block} editor={props.editor} />,
  },
);