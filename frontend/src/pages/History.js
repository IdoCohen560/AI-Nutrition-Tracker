import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad(n) { return String(n).padStart(2, '0'); }

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - d.getDay());
  return toISO(d);
}

function shiftDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function fmtDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtShort(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function History() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab') === 'edit' ? 'edit' : 'view';
  const [tab, setTab] = useState(initialTab);
  const today = useMemo(localToday, []);
  const monthStart = useMemo(firstOfMonth, []);

  return (
    <div className="page">
      <h1>History</h1>

      <div className="range-toggle history-tabs">
        <button type="button" className={tab === 'view' ? 'active' : ''} onClick={() => { setTab('view'); setParams({}); }}>
          View History
        </button>
        <button type="button" className={tab === 'edit' ? 'active' : ''} onClick={() => { setTab('edit'); setParams({ tab: 'edit' }); }}>
          Edit History
        </button>
      </div>

      {tab === 'view' ? (
        <ViewHistory dateParam={params.get('date')} setParams={setParams} today={today} monthStart={monthStart} />
      ) : (
        <EditHistory today={today} monthStart={monthStart} initialDate={params.get('date') || today} />
      )}
    </div>
  );
}

function ViewHistory({ dateParam, setParams, today, monthStart }) {
  const defaultStart = useMemo(() => shiftDays(today, -7), [today]);
  const [startDate, setStartDate] = useState(dateParam || defaultStart);
  const [endDate, setEndDate] = useState(dateParam || today);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (s, e) => {
    setErr('');
    setLoading(true);
    try {
      const data = await api(`/logs/history?start=${s}&end=${e}`);
      setEntries(data);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dateParam) {
      setStartDate(dateParam);
      setEndDate(dateParam);
      load(dateParam, dateParam);
    } else {
      load(startDate, endDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  const byDate = entries.reduce((acc, e) => {
    const d = e.created_at?.slice(0, 10) || '?';
    if (!acc[d]) acc[d] = { total: 0, items: [] };
    acc[d].total += e.total_calories;
    acc[d].items.push(e);
    return acc;
  }, {});

  return (
    <>
      <p className="muted">Complete breakdown for the date range you choose.</p>
      <div className="card filter-row">
        <label>
          From
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => { setParams({}); load(startDate, endDate); }} disabled={loading}>
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}

      {Object.keys(byDate)
        .sort()
        .reverse()
        .map((date) => (
          <div key={date} className="card history-day">
            <div className="card-header">
              <h2>
                {fmtDate(date)} <span className="muted">· {byDate[date].total} kcal total</span>
              </h2>
            </div>
            <ul className="entry-list">
              {byDate[date].items.map((e) => (
                <li key={e.id} className="entry-row">
                  <div>
                    <strong>{e.meal_type}</strong>
                    <span className="muted"> · {e.total_calories} kcal</span>
                    <p className="small muted">
                      {e.description_text || e.items?.map((i) => i.name).join(', ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {entries.length === 0 && !loading && !err && <p className="muted">No entries in this range.</p>}
    </>
  );
}

function EditHistory({ today, monthStart, initialDate }) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [weekStart, setWeekStart] = useState(startOfWeek(initialDate));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = weekDays[6];

  const load = useCallback(async (iso) => {
    setErr('');
    setLoading(true);
    try {
      const data = await api(`/logs/history?start=${iso}&end=${iso}`);
      setEntries(data);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selectedDate); }, [selectedDate, load]);

  async function deleteEntry(id) {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await api(`/logs/${id}`, { method: 'DELETE' });
      load(selectedDate);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  const totalKcal = entries.reduce((s, e) => s + e.total_calories, 0);
  const canEdit = selectedDate >= monthStart && selectedDate <= today;
  const canGoNextWeek = weekDays[0] < today;

  return (
    <>
      <p className="muted">Edit one day at a time. Use the arrows to switch weeks.</p>

      <div className="card">
        <div className="week-nav">
          <button
            type="button"
            className="btn ghost small week-nav-btn"
            aria-label="Previous week"
            onClick={() => setWeekStart(shiftDays(weekStart, -7))}
          >
            ‹
          </button>
          <strong className="week-nav-label">{fmtShort(weekStart)} – {fmtShort(weekEnd)}</strong>
          <button
            type="button"
            className="btn ghost small week-nav-btn"
            aria-label="Next week"
            disabled={!canGoNextWeek}
            onClick={() => setWeekStart(shiftDays(weekStart, 7))}
          >
            ›
          </button>
        </div>

        <div className="week-strip">
          {weekDays.map((iso, i) => {
            const isFuture = iso > today;
            const isSelected = iso === selectedDate;
            return (
              <button
                key={iso}
                type="button"
                className={`week-day ${isSelected ? 'selected' : ''} ${isFuture ? 'future' : ''}`}
                disabled={isFuture}
                onClick={() => setSelectedDate(iso)}
              >
                <div className="week-day-name">{DOW[i]}</div>
                <div className="week-day-num">{parseISO(iso).getDate()}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card edit-day-card">
        <div className="card-header">
          <h2>{fmtDate(selectedDate)} <span className="muted">· {totalKcal} kcal total</span></h2>
        </div>
        {!canEdit && (
          <p className="notice">You can only add new entries for dates within the current month.</p>
        )}
        {err && <div className="error-banner">{err}</div>}
        {loading && <p className="muted">Loading…</p>}
        {!loading && entries.length === 0 && <p className="muted">No entries logged.</p>}
        <ul className="entry-list">
          {entries.map((e) => (
            <li key={e.id} className="entry-row">
              <div>
                <strong>{e.meal_type}</strong>
                <span className="muted"> · {e.total_calories} kcal</span>
                <p className="small muted">
                  {e.description_text || e.items?.map((i) => i.name).join(', ')}
                </p>
              </div>
              <button type="button" className="btn danger ghost small" onClick={() => deleteEntry(e.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="edit-day-actions">
            <Link to={`/log?date=${selectedDate}`} className="btn primary">
              + Add food
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
