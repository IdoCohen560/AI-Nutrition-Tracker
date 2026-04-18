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
  const [confirmEntry, setConfirmEntry] = useState(null); // entry pending deletion
  const [undoItem, setUndoItem] = useState(null); // { entry, date } — most recent delete

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

  async function performDelete(entry) {
    setConfirmEntry(null);
    try {
      await api(`/logs/${entry.id}`, { method: 'DELETE' });
      setUndoItem({ entry, date: selectedDate, at: Date.now() });
      load(selectedDate);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function undoDelete() {
    if (!undoItem) return;
    const { entry, date } = undoItem;
    const tzOffset = new Date().getTimezoneOffset();
    setUndoItem(null);
    try {
      await api('/logs', {
        method: 'POST',
        body: JSON.stringify({
          meal_type: entry.meal_type,
          description_text: entry.description_text,
          items: entry.items || [],
          parse_confidence: entry.parse_confidence,
          confirmed: true,
          for_date: date,
          tz_offset: tzOffset,
        }),
      });
      load(selectedDate);
    } catch (ex) {
      setErr(`Undo failed: ${ex.message}`);
    }
  }

  // Auto-dismiss undo toast after 10 seconds
  useEffect(() => {
    if (!undoItem) return;
    const id = setTimeout(() => setUndoItem(null), 10000);
    return () => clearTimeout(id);
  }, [undoItem]);

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
              <button type="button" className="btn danger ghost small" onClick={() => setConfirmEntry(e)}>
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

      {confirmEntry && (
        <div className="bc-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-panel">
            <h2>Delete this entry?</h2>
            <p className="muted small" style={{ margin: '0 0 0.75rem' }}>
              From {fmtDate(selectedDate)}
            </p>
            <div className="confirm-entry">
              <strong>{confirmEntry.meal_type}</strong> · {confirmEntry.total_calories} kcal
              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                {confirmEntry.description_text
                  || confirmEntry.items?.map((i) => i.name).join(', ')
                  || '(no description)'}
              </p>
            </div>
            <p className="muted small" style={{ marginTop: '0.75rem' }}>
              You'll have 10 seconds to undo.
            </p>
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setConfirmEntry(null)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={() => performDelete(confirmEntry)}>
                Delete entry
              </button>
            </div>
          </div>
        </div>
      )}

      {undoItem && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span>
            Deleted <strong>{undoItem.entry.meal_type}</strong> from {fmtDate(undoItem.date)}
          </span>
          <button type="button" className="btn linkish" onClick={undoDelete}>Undo</button>
          <button type="button" className="btn linkish" aria-label="Dismiss" onClick={() => setUndoItem(null)}>✕</button>
        </div>
      )}
    </>
  );
}
