// ============================================================
// FORMULA PANEL - KaTeX Math Rendering
// ============================================================
// PURPOSE: Edit and preview mathematical formulas using KaTeX.
//
// KaTeX is a fast math typesetting library. You write formulas in
// LaTeX syntax, and it renders beautiful math notation.
//
// EXAMPLE FORMULAS:
// - Simple: x^2 + y^2 = r^2
// - Fractions: \frac{a}{b}
// - Greek letters: \alpha, \beta, \gamma
// - Integrals: \int_0^1 x^2 dx
// - Matrices: \begin{matrix} a & b \\ c & d \end{matrix}
//
// MODES:
// - Edit: Textarea for writing LaTeX
// - Preview: Rendered math output
// ============================================================

'use client';

import React, { useState, useEffect, useRef } from 'react';

// ============================================================
// PROPS INTERFACE
// ============================================================
interface FormulaPanelProps {
  formula: string;                    // Current formula string
  onSave: (formula: string) => void;  // Called when formula is saved
}

// ============================================================
// COMPONENT
// ============================================================
export default function FormulaPanel({ formula, onSave }: FormulaPanelProps) {
  const [localFormula, setLocalFormula] = useState(formula);
  const [isEditing, setIsEditing] = useState(!formula);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [katexLoaded, setKatexLoaded] = useState(false);

  // --------------------------------------------------------
  // LOAD KATEX DYNAMICALLY
  // --------------------------------------------------------
  // We load KaTeX from CDN only when needed (saves bundle size)
  // --------------------------------------------------------
  useEffect(() => {
    // Check if KaTeX is already loaded
    if ((window as any).katex) {
      setKatexLoaded(true);
      return;
    }

    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.onload = () => {
      setKatexLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // --------------------------------------------------------
  // RENDER FORMULA
  // --------------------------------------------------------
  useEffect(() => {
    if (!katexLoaded || !previewRef.current || !localFormula) return;

    try {
      const katex = (window as any).katex;
      katex.render(localFormula, previewRef.current, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
      });
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [localFormula, katexLoaded]);

  // --------------------------------------------------------
  // HANDLE SAVE
  // --------------------------------------------------------
  const handleSave = () => {
    onSave(localFormula);
    setIsEditing(false);
  };

  // ============================================================
  // EXAMPLE FORMULAS
  // ============================================================
  const examples = [
    { label: 'Quadratic', formula: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}' },
    { label: "Euler's", formula: 'e^{i\\pi} + 1 = 0' },
    { label: 'Integral', formula: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}' },
    { label: 'Sum', formula: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}' },
  ];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        padding: '16px',
      }}
    >
      {/* ======================================================== */}
      {/* TOOLBAR */}
      {/* ======================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{
              background: isEditing ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {isEditing ? '👁️ Preview' : '✏️ Edit'}
          </button>
        </div>

        {isEditing && (
          <button
            onClick={handleSave}
            style={{
              background: '#22c55e',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            💾 Save
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* EDIT MODE */}
      {/* ======================================================== */}
      {isEditing ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Examples */}
          <div>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
              Quick examples:
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {examples.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => setLocalFormula(ex.formula)}
                  style={{
                    background: '#333',
                    border: 'none',
                    color: '#ccc',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={localFormula}
            onChange={(e) => setLocalFormula(e.target.value)}
            placeholder="Enter LaTeX formula, e.g., x^2 + y^2 = r^2"
            style={{
              flex: 1,
              background: '#2d2d2d',
              border: '1px solid #444',
              borderRadius: '4px',
              padding: '12px',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '14px',
              resize: 'none',
            }}
          />

          {/* Live Preview */}
          <div>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
              Live preview:
            </div>
            <div
              ref={previewRef}
              style={{
                background: '#2d2d2d',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '16px',
                minHeight: '60px',
                textAlign: 'center',
                color: error ? '#ef4444' : '#fff',
              }}
            >
              {!localFormula && <span style={{ color: '#666' }}>Formula preview will appear here</span>}
              {error && <span>Error: {error}</span>}
            </div>
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* PREVIEW MODE */
        /* ======================================================== */
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#2d2d2d',
            borderRadius: '8px',
          }}
        >
          {localFormula ? (
            <div
              ref={previewRef}
              style={{
                fontSize: '24px',
                color: '#fff',
              }}
            />
          ) : (
            <div style={{ color: '#666', textAlign: 'center' }}>
              <p>No formula yet</p>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  background: '#0070f3',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginTop: '8px',
                }}
              >
                Add Formula
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* HELP TEXT */}
      {/* ======================================================== */}
      {isEditing && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px',
            background: '#252526',
            borderRadius: '4px',
            color: '#888',
            fontSize: '11px',
          }}
        >
          <strong>LaTeX Tips:</strong>
          {' '}Use ^{'{}'} for superscript, _{'{}'} for subscript, \frac{'{a}{b}'} for fractions,
          {' '}\sqrt{'{x}'} for roots, \int for integrals, \sum for sums.
          {' '}<a
            href="https://katex.org/docs/supported.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0070f3' }}
          >
            Full reference →
          </a>
        </div>
      )}
    </div>
  );
}
