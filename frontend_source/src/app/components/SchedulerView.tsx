'use client';

import React, { useState } from 'react';
import type { CalendarEvent } from '@/lib/types';

interface SchedulerViewProps {
  events: CalendarEvent[];
  onAddEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
}

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0');
  return `${h}:00`;
});

const COLORS = ['#0070f3', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function SchedulerView({ events, onAddEvent, onDeleteEvent, onUpdateEvent }: SchedulerViewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [color, setColor] = useState('#0070f3');
  const [notes, setNotes] = useState('');
  const [viewDays, setViewDays] = useState(1);

  const dayEvents = events.filter(e => e.start.startsWith(selectedDate));

  const getDates = () => {
    const dates: string[] = [];
    const base = new Date(selectedDate);
    for (let i = 0; i < viewDays; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    const event: CalendarEvent = {
      id: editingId || `sched-${Date.now()}`,
      title: title.trim(),
      start: `${selectedDate}T${startTime}`,
      end: `${selectedDate}T${endTime}`,
      color,
    };
    if (editingId) {
      onUpdateEvent(editingId, event);
    } else {
      onAddEvent(event);
    }
    resetForm();
  };

  const handleEdit = (event: CalendarEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setStartTime(event.start.split('T')[1]?.slice(0, 5) || '09:00');
    setEndTime(event.end?.split('T')[1]?.slice(0, 5) || '10:00');
    setColor(event.color || '#0070f3');
    setShowForm(true);
  };

  const resetForm = () => {
    setTitle(''); setStartTime('09:00'); setEndTime('10:00');
    setColor('#0070f3'); setNotes(''); setEditingId(null); setShowForm(false);
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startH = parseInt(event.start.split('T')[1]?.split(':')[0] || '0');
    const startM = parseInt(event.start.split('T')[1]?.split(':')[1] || '0');
    const endH = parseInt(event.end?.split('T')[1]?.split(':')[0] || String(startH + 1));
    const endM = parseInt(event.end?.split('T')[1]?.split(':')[1] || '0');
    const top = (startH + startM / 60) * 60;
    const height = Math.max(((endH + endM / 60) - (startH + startM / 60)) * 60, 30);
    return { top, height };
  };

  const navigateDay = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigateDay(-1)} style={{ background: '#333', border: 'none', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>←</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ background: '#333', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '4px' }} />
          <button onClick={() => navigateDay(1)} style={{ background: '#333', border: 'none', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>→</button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1, 3, 7].map(d => (
            <button key={d} onClick={() => setViewDays(d)}
              style={{ background: viewDays === d ? '#0070f3' : '#333', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
              {d === 1 ? 'Day' : d === 3 ? '3 Day' : 'Week'}
            </button>
          ))}
          <button onClick={() => setShowForm(true)}
            style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer' }}>
            + Event
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: '1px' }}>
        {getDates().map(dateStr => {
          const dateEvents = events.filter(e => e.start.startsWith(dateStr));
          return (
            <div key={dateStr} style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ color: '#888', fontSize: '12px', textAlign: 'center', padding: '8px', background: '#252530', borderBottom: '1px solid #333' }}>
                {new Date(dateStr + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div style={{ position: 'relative', height: `${24 * 60}px` }}>
                {TIME_SLOTS.map((slot, i) => (
                  <div key={slot} style={{
                    position: 'absolute', top: i * 60, left: 0, right: 0, height: '60px',
                    borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'flex-start',
                  }}>
                    {viewDays === 1 && (
                      <div style={{ color: '#555', fontSize: '10px', width: '40px', textAlign: 'right', paddingRight: '8px', paddingTop: '2px' }}>{slot}</div>
                    )}
                  </div>
                ))}
                {dateEvents.map(event => {
                  const pos = getEventPosition(event);
                  return (
                    <div key={event.id}
                      onClick={() => handleEdit(event)}
                      onDoubleClick={(e) => { e.stopPropagation(); onUpdateEvent(event.id, { ...event, done: !(event as any).done } as any); }}
                      style={{
                        position: 'absolute', top: pos.top, left: viewDays === 1 ? '48px' : '4px',
                        right: '4px', height: pos.height, background: event.color || '#0070f3',
                        borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
                        overflow: 'hidden', fontSize: '12px', color: '#fff', opacity: 0.9,
                      }}>
                      <div style={{ fontWeight: 'bold', textDecoration: (event as any).done ? 'line-through' : 'none' }}>{event.title}</div>
                      <div style={{ fontSize: '10px', opacity: 0.8 }}>
                        {event.start.split('T')[1]?.slice(0, 5)} - {event.end?.split('T')[1]?.slice(0, 5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={resetForm}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>{editingId ? 'Edit Event' : 'New Event'}</h3>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input value={startTime} onChange={e => setStartTime(e.target.value)} type="time"
                style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
              <span style={{ color: '#666', alignSelf: 'center' }}>to</span>
              <input value={endTime} onChange={e => setEndTime(e.target.value)} type="time"
                style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', background: c, cursor: 'pointer',
                    border: color === c ? '3px solid #fff' : '3px solid transparent' }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <div>
                {editingId && (
                  <button onClick={() => { onDeleteEvent(editingId); resetForm(); }}
                    style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={resetForm}
                  style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleAdd}
                  style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                  {editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}