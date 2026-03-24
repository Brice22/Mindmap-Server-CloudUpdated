// ============================================================
// CHART PANEL - Data Visualization
// ============================================================
// PURPOSE: Embed charts and graphs from various sources.
//
// SUPPORTED TYPES:
// 1. Chart.js - Create charts with JSON configuration
// 2. Desmos - Embed graphing calculator (paste share URL)
// 3. GeoGebra - Embed math visualizations (paste share URL)
// 4. Custom URL - Embed any iframe-compatible URL
//
// CHART.JS EXAMPLE:
// {
//   "type": "line",
//   "data": {
//     "labels": ["Jan", "Feb", "Mar"],
//     "datasets": [{
//       "label": "Sales",
//       "data": [30, 50, 40]
//     }]
//   }
// }
// ============================================================

'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { ChartConfig } from '@/lib/types';

// ============================================================
// PROPS INTERFACE
// ============================================================
interface ChartPanelProps {
  config?: ChartConfig;
  onSave: (config: ChartConfig) => void;
}

// ============================================================
// COMPONENT
// ============================================================
export default function ChartPanel({ config, onSave }: ChartPanelProps) {
  const [chartType, setChartType] = useState<ChartConfig['type']>(config?.type || 'chartjs');
  const [chartjsJson, setChartjsJson] = useState(
    config?.chartjsConfig ? JSON.stringify(config.chartjsConfig, null, 2) : ''
  );
  const [desmosUrl, setDesmosUrl] = useState(config?.desmosUrl || '');
  const [geogebraUrl, setGeogebraUrl] = useState(config?.geogebraUrl || '');
  const [customUrl, setCustomUrl] = useState(config?.customUrl || '');
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(!config);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  // --------------------------------------------------------
  // LOAD CHART.JS DYNAMICALLY
  // --------------------------------------------------------
  useEffect(() => {
    if ((window as any).Chart) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.onload = () => {
      console.log('[ChartPanel] Chart.js loaded');
    };
    document.head.appendChild(script);
  }, []);

  // --------------------------------------------------------
  // RENDER CHART.JS
  // --------------------------------------------------------
  useEffect(() => {
    if (chartType !== 'chartjs' || !chartjsJson || !canvasRef.current) return;
    
    const Chart = (window as any).Chart;
    if (!Chart) return;

    try {
      // Parse the JSON
      const parsed = JSON.parse(chartjsJson);
      setError(null);

      // Destroy previous chart if exists
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      // Create new chart
      chartRef.current = new Chart(canvasRef.current, parsed);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [chartType, chartjsJson]);

  // --------------------------------------------------------
  // HANDLE SAVE
  // --------------------------------------------------------
  const handleSave = () => {
    let newConfig: ChartConfig = { type: chartType };

    switch (chartType) {
      case 'chartjs':
        try {
          newConfig.chartjsConfig = JSON.parse(chartjsJson);
        } catch {
          setError('Invalid JSON for Chart.js');
          return;
        }
        break;
      case 'desmos':
        newConfig.desmosUrl = desmosUrl;
        break;
      case 'geogebra':
        newConfig.geogebraUrl = geogebraUrl;
        break;
      case 'custom':
        newConfig.customUrl = customUrl;
        break;
    }

    onSave(newConfig);
    setIsEditing(false);
    setError(null);
  };

  // --------------------------------------------------------
  // EXTRACT EMBED URL
  // --------------------------------------------------------
  // Convert share URLs to embed URLs
  const getEmbedUrl = (url: string, type: 'desmos' | 'geogebra'): string => {
    if (type === 'desmos') {
      // Desmos: https://www.desmos.com/calculator/abc123 → embed URL
      const match = url.match(/desmos\.com\/calculator\/([a-zA-Z0-9]+)/);
      if (match) {
        return `https://www.desmos.com/calculator/${match[1]}?embed`;
      }
    }
    if (type === 'geogebra') {
      // GeoGebra: https://www.geogebra.org/m/abc123 → embed URL
      const match = url.match(/geogebra\.org\/m\/([a-zA-Z0-9]+)/);
      if (match) {
        return `https://www.geogebra.org/material/iframe/id/${match[1]}`;
      }
    }
    return url;
  };

  // ============================================================
  // EXAMPLE CHART.JS CONFIGS
  // ============================================================
  const examples = [
    {
      label: 'Line Chart',
      config: {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
          datasets: [{
            label: 'Revenue',
            data: [12, 19, 3, 5, 20],
            borderColor: '#0070f3',
            tension: 0.1,
          }],
        },
      },
    },
    {
      label: 'Bar Chart',
      config: {
        type: 'bar',
        data: {
          labels: ['Red', 'Blue', 'Yellow', 'Green'],
          datasets: [{
            label: 'Votes',
            data: [12, 19, 3, 5],
            backgroundColor: ['#ef4444', '#3b82f6', '#eab308', '#22c55e'],
          }],
        },
      },
    },
    {
      label: 'Pie Chart',
      config: {
        type: 'pie',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{
            data: [30, 50, 20],
            backgroundColor: ['#ef4444', '#3b82f6', '#22c55e'],
          }],
        },
      },
    },
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
          {/* Chart Type Selector */}
          <div>
            <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
              Chart Source:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['chartjs', 'desmos', 'geogebra', 'custom'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  style={{
                    background: chartType === type ? '#0070f3' : '#333',
                    border: 'none',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textTransform: 'capitalize',
                  }}
                >
                  {type === 'chartjs' ? 'Chart.js' : type}
                </button>
              ))}
            </div>
          </div>

          {/* Chart.js Editor */}
          {chartType === 'chartjs' && (
            <>
              <div>
                <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
                  Examples:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {examples.map(ex => (
                    <button
                      key={ex.label}
                      onClick={() => setChartjsJson(JSON.stringify(ex.config, null, 2))}
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
              <textarea
                value={chartjsJson}
                onChange={(e) => setChartjsJson(e.target.value)}
                placeholder='{"type": "line", "data": {...}}'
                style={{
                  flex: 1,
                  background: '#2d2d2d',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  color: '#fff',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  resize: 'none',
                }}
              />
            </>
          )}

          {/* Desmos URL Input */}
          {chartType === 'desmos' && (
            <div>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
                Paste Desmos share URL (e.g., https://www.desmos.com/calculator/abc123):
              </div>
              <input
                type="text"
                value={desmosUrl}
                onChange={(e) => setDesmosUrl(e.target.value)}
                placeholder="https://www.desmos.com/calculator/..."
                style={{
                  width: '100%',
                  background: '#2d2d2d',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              />
            </div>
          )}

          {/* GeoGebra URL Input */}
          {chartType === 'geogebra' && (
            <div>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
                Paste GeoGebra share URL (e.g., https://www.geogebra.org/m/abc123):
              </div>
              <input
                type="text"
                value={geogebraUrl}
                onChange={(e) => setGeogebraUrl(e.target.value)}
                placeholder="https://www.geogebra.org/m/..."
                style={{
                  width: '100%',
                  background: '#2d2d2d',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              />
            </div>
          )}

          {/* Custom URL Input */}
          {chartType === 'custom' && (
            <div>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '6px' }}>
                Enter any embeddable URL:
              </div>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%',
                  background: '#2d2d2d',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              />
            </div>
          )}

          {error && (
            <div style={{ color: '#ef4444', fontSize: '12px' }}>
              {error}
            </div>
          )}
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
            overflow: 'hidden',
          }}
        >
          {chartType === 'chartjs' && chartjsJson && (
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          )}

          {chartType === 'desmos' && desmosUrl && (
            <iframe
              src={getEmbedUrl(desmosUrl, 'desmos')}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Desmos Graph"
            />
          )}

          {chartType === 'geogebra' && geogebraUrl && (
            <iframe
              src={getEmbedUrl(geogebraUrl, 'geogebra')}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="GeoGebra"
            />
          )}

          {chartType === 'custom' && customUrl && (
            <iframe
              src={customUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Custom Embed"
            />
          )}

          {!chartjsJson && !desmosUrl && !geogebraUrl && !customUrl && (
            <div style={{ color: '#666', textAlign: 'center' }}>
              <p>No chart configured</p>
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
                Add Chart
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
