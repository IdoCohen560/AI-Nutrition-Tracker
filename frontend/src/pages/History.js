import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

export default function History() {
  const [params, setParams] = useSearchParams();
  const dateParam = params.get('date');
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const [startDate, setStartDate] = useState(dateParam || toISO(start));
  const [endDate, setEndDate] = useState(dateParam || toISO(end));
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
    <div className="page">
      <h1>History</h1>
      <p className="muted">Filter by date range. Each day shows nutritional totals.</p>

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
            <h2>
              {date} <span className="muted">· {byDate[date].total} kcal total</span>
            </h2>
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
    </div>
  );
}
