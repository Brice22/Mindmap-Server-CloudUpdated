'use client';

import React, { useState, useEffect, useRef } from 'react';

interface HealthEntry {
  id: number;
  date: string;
  type: 'weight' | 'calories' | 'exercise' | 'sleep' | 'water' | 'bloodpressure' | 'supplements' | 'vitamins';
  value: number;
  value2?: number; // for blood pressure diastolic
  notes: string;
}

interface HealthViewProps {
  onAddToCalendar: (title: string, date: string, color: string) => void;
}

const HEALTH_TYPES = [
  { id: 'weight', label: 'Weight (lbs)', icon: '⚖️', color: '#3b82f6', unit: 'lbs' },
  { id: 'calories', label: 'Calories', icon: '🔥', color: '#f59e0b', unit: 'kcal' },
  { id: 'exercise', label: 'Exercise (min)', icon: '🏃', color: '#22c55e', unit: 'min' },
  { id: 'sleep', label: 'Sleep (hrs)', icon: '😴', color: '#8b5cf6', unit: 'hrs' },
  { id: 'water', label: 'Water (oz)', icon: '💧', color: '#06b6d4', unit: 'oz' },
  { id: 'bloodpressure', label: 'Blood Pressure', icon: '❤️', color: '#ef4444', unit: 'mmHg' },
  { id: 'supplements', label: 'Supplements', icon: '💊', color: '#a855f7', unit: '' },
  { id: 'vitamins', label: 'Vitamins', icon: '🧬', color: '#f472b6', unit: 'mg' },
];

export default function HealthView({ onAddToCalendar }: HealthViewProps) {
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [entryType, setEntryType] = useState<HealthEntry['type']>('weight');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [chartType, setChartType] = useState<HealthEntry['type']>('weight');
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  // Load Chart.js
  useEffect(() => {
    if ((window as any).Chart) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    document.head.appendChild(script);
  }, []);

  // Render chart
  useEffect(() => {
    if (!chartRef.current || !(window as any).Chart) return;
    const Chart = (window as any).Chart;
    if (chartInstance.current) chartInstance.current.destroy();

    const filtered = entries
      .filter(e => e.type === chartType)
      .sort((a, b) => a.date.localeCompare(b.date));

    const typeInfo = HEALTH_TYPES.find(t => t.id === chartType);

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: filtered.map(e => e.date.slice(5)),
        datasets: [{
          label: typeInfo?.label || chartType,
          data: filtered.map(e => e.value),
          borderColor: typeInfo?.color || '#0070f3',
          backgroundColor: (typeInfo?.color || '#0070f3') + '20',
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        scales: {
          x: { ticks: { color: '#666' }, grid: { color: '#333' } },
          y: { ticks: { color: '#666' }, grid: { color: '#333' } },
        },
        plugins: { legend: { labels: { color: '#ccc' } } },
      },
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [entries, chartType]);

  const handleAdd = () => {
    if (!value) return;
    const entry: HealthEntry = {
      id: Date.now(),
      date,
      type: entryType,
      value: parseFloat(value),
      value2: value2 ? parseFloat(value2) : undefined,
      notes,
    };
    setEntries(prev => [entry, ...prev]);

    const typeInfo = HEALTH_TYPES.find(t => t.id === entryType);
    const label = entryType === 'bloodpressure'
      ? `${typeInfo?.icon} ${value}/${value2} mmHg`
      : `${typeInfo?.icon} ${value} ${typeInfo?.unit}`;
    onAddToCalendar(label, date, typeInfo?.color || '#0070f3');

    setValue(''); setValue2(''); setNotes(''); setShowForm(false);
  };

  // Today's entries summary
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = entries.filter(e => e.date === today);

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Health & Nutrition</h2>
        <button onClick={() => setShowForm(true)}
          style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
          + Log Entry
        </button>
      </div>

      {/* Today's Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {HEALTH_TYPES.map(ht => {
          const todayVal = todayEntries.find(e => e.type === ht.id);
          return (
            <div key={ht.id} style={{
              background: '#2a2a3a', padding: '12px', borderRadius: '8px',
              borderLeft: `4px solid ${ht.color}`, cursor: 'pointer',
            }} onClick={() => setChartType(ht.id as any)}>
              <div style={{ fontSize: '20px' }}>{ht.icon}</div>
              <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>{ht.label}</div>
              <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
                {todayVal ? (ht.id === 'bloodpressure' ? `${todayVal.value}/${todayVal.value2}` : todayVal.value) : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {HEALTH_TYPES.map(ht => (
            <button key={ht.id} onClick={() => setChartType(ht.id as any)}
              style={{
                background: chartType === ht.id ? ht.color : '#333',
                border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px',
                cursor: 'pointer', fontSize: '12px',
              }}>
              {ht.icon} {ht.label}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: '300px', display: 'flex', justifyContent: 'center' }}>
          {entries.filter(e => e.type === chartType).length > 0 ? (
            <canvas ref={chartRef} style={{ maxHeight: '280px' }} />
          ) : (
            <div style={{ color: '#666', padding: '40px' }}>No {HEALTH_TYPES.find(t => t.id === chartType)?.label} data yet</div>
          )}
        </div>
      </div>

      {/* Recent Entries */}
      <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', color: '#888', fontSize: '12px', textTransform: 'uppercase' }}>Recent Entries</div>
        {entries.slice(0, 20).map(entry => {
          const typeInfo = HEALTH_TYPES.find(t => t.id === entry.type);
          return (
            <div key={entry.id} style={{
              display: 'flex', alignItems: 'center', padding: '10px 16px',
              borderBottom: '1px solid #2a2a2a', gap: '12px',
            }}>
              <span style={{ fontSize: '18px' }}>{typeInfo?.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: '14px' }}>
                  {entry.type === 'bloodpressure' ? `${entry.value}/${entry.value2} mmHg` : `${entry.value} ${typeInfo?.unit}`}
                </div>
                <div style={{ color: '#666', fontSize: '11px' }}>{entry.date}{entry.notes ? ` · ${entry.notes}` : ''}</div>
              </div>
              <button onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Log Health Entry</h3>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {HEALTH_TYPES.map(ht => (
                <button key={ht.id} onClick={() => setEntryType(ht.id as any)}
                  style={{
                    background: entryType === ht.id ? ht.color : '#333',
                    border: 'none', color: '#fff', padding: '6px 10px', borderRadius: '4px',
                    cursor: 'pointer', fontSize: '12px',
                  }}>
                  {ht.icon} {ht.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={value} onChange={e => setValue(e.target.value)} 
                 placeholder={entryType === 'bloodpressure' ? 'Systolic' : entryType === 'supplements' ? 'Number taken' : entryType === 'vitamins' ? 'Dosage (mg)' : 'Value'}
                 type="number"
                style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
              {entryType === 'bloodpressure' && (
                <input value={value2} onChange={e => setValue2(e.target.value)} placeholder="Diastolic" type="number"
                  style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
              )}
            </div>
            <input value={date} onChange={e => setDate(e.target.value)} type="date"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={entryType === 'supplements' ? 'e.g. Fish Oil, Magnesium, Creatine' : entryType === 'vitamins' ? 'e.g. Vitamin D3, B12, Iron' : 'Notes (optional)'}
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}