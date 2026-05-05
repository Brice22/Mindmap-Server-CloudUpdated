'use client';

import React, { useState } from 'react';
import type { CalendarEvent, Node } from '@/lib/types';

// FullCalendar is heavy — dynamically import it
// You'll need: bun add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: string) => void | Promise<void>;
  onUpdateEvent?: (id: string, updates: Partial<CalendarEvent>) => void | Promise<void>;
  onDeleteEvent?: (id: string) => void | Promise<void>;
}

const EVENT_COLORS = ['#0070f3', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function CalendarView({ events, onEventClick, onDateClick, onUpdateEvent, onDeleteEvent }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState('#0070f3');
  const [editStart, setEditStart] = useState('');

  // Simple calendar grid — replace with FullCalendar once deps installed
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button onClick={() => setCurrentMonth(new Date(year, month - 1))}
          style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
          ←
        </button>
        <h2 style={{ color: '#fff' }}>{monthNames[month]} {year}</h2>
        <button onClick={() => setCurrentMonth(new Date(year, month + 1))}
          style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
          →
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ padding: '8px', textAlign: 'center', color: '#666', fontSize: '12px' }}>{d}</div>
        ))}
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* Day cells */}
        {days.map(day => {
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dayEvents = events.filter(e => e.start.startsWith(dateStr));
          return (
            <div key={day}
              onClick={() => onDateClick(dateStr)}
              style={{
                padding: '8px', minHeight: '80px', background: '#2a2a3a',
                borderRadius: '4px', cursor: 'pointer',
              }}
            >
              <div style={{ color: '#fff', fontSize: '14px', marginBottom: '4px' }}>{day}</div>
              {dayEvents.map(ev => (
                <div key={ev.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEvent(ev);
                    setEditTitle(ev.title);
                    setEditColor(ev.color || '#0070f3');
                    setEditStart(ev.start?.split('T')[0] || '');
                    onEventClick(ev);
                  }}
                  style={{
                    background: ev.color || '#0070f3', padding: '2px 4px',
                    borderRadius: '2px', fontSize: '11px', color: '#fff',
                    marginBottom: '2px', overflow: 'hidden', whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >{ev.title}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Edit Event Modal */}
      {editingEvent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
          onClick={() => setEditingEvent(null)}>
          <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>Edit Event</h3>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Event title"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
            <input value={editStart} onChange={e => setEditStart(e.target.value)} type="date"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {EVENT_COLORS.map(c => (
                <div key={c} onClick={() => setEditColor(c)}
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%', background: c, cursor: 'pointer',
                    border: editColor === c ? '3px solid #fff' : '3px solid transparent',
                  }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <button onClick={() => {
                if (onDeleteEvent) onDeleteEvent(editingEvent.id);
                setEditingEvent(null);
              }}
                style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Delete
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditingEvent(null)}
                  style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => {
                  if (onUpdateEvent) onUpdateEvent(editingEvent.id, { title: editTitle, start: editStart, color: editColor });
                  setEditingEvent(null);
                }}
                  style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}