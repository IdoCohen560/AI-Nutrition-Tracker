import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function buildWeek(refDate) {
  const start = startOfWeek(refDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function buildMonthGrid(refDate) {
  const first = startOfMonth(refDate);
  const last = endOfMonth(refDate);
  const startPad = first.getDay();
  const totalCells = Math.ceil((startPad + last.getDate()) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const day = i - startPad + 1;
    if (day < 1 || day > last.getDate()) cells.push(null);
    else cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  return cells;
}

export default function Calendar() {
  const [view, setView] = useState('week');
  const [data, setData] = useState({});
  const today = useMemo(() => new Date(), []);
  const todayISO = toISO(today);
  const nav = useNavigate();

  const range = useMemo(() => {
    if (view === 'week') {
      const days = buildWeek(today);
      return { from: toISO(days[0]), to: toISO(days[6]), days };
    }
    return { from: toISO(startOfMonth(today)), to: toISO(endOfMonth(today)), days: buildMonthGrid(today) };
  }, [view, today]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api(`/dashboard/calendar?from=${range.from}&to=${range.to}`);
        if (cancelled) return;
        const map = {};
        res.days.forEach((d) => { map[d.date] = d; });
        setData(map);
      } catch {
        /* ignore */
      }
    }
    load();
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  function onDayClick(d) {
    if (!d) return;
    const iso = toISO(d);
    if (iso > todayISO) return;
    nav(`/history?date=${iso}`);
  }

  return (
    <div className="card calendar-card">
      <div className="card-header">
        <h2>Calendar</h2>
        <div className="range-toggle small">
          <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button>
          <button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
        </div>
      </div>

      <div className="cal-grid-head">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className={`cal-grid ${view}`}>
        {range.days.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="cal-cell empty" />;
          const iso = toISO(d);
          const day = data[iso];
          const isFuture = iso > todayISO;
          const isToday = iso === todayISO;
          return (
            <button
              key={iso}
              type="button"
              className={`cal-cell ${isFuture ? 'future' : ''} ${isToday ? 'today' : ''} ${day ? 'has-data' : ''}`}
              onClick={() => onDayClick(d)}
              disabled={isFuture}
              title={day ? `${day.consumed_calories} kcal · ${day.total_protein_g}g protein` : ''}
            >
              <div className="cal-day-num">{d.getDate()}</div>
              {day && (
                <div className="cal-day-stats">
                  <div className="cal-cal">{day.consumed_calories} kcal</div>
                  <div className="cal-pro">{day.total_protein_g}g P</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
