'use client';

import React, { useState } from 'react';
import type { CalendarEvent, Node } from '@/lib/types';

// FullCalendar is heavy — dynamically import it
// You'll need: bun add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: string) => void | Promise<void>;
}

export default function CalendarView({ events, onEventClick, onDateClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
                  onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
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
    </div>
  );
}