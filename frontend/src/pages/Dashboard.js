import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api';

const MACRO_COLORS = ['var(--chart-protein)', 'var(--chart-carbs)', 'var(--chart-fat)'];

export default function Dashboard() {
  const [today, setToday] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [recs, setRecs] = useState(null);
  const [recErr, setRecErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [t, w] = await Promise.all([api('/dashboard/today'), api('/dashboard/weekly')]);
    setToday(t);
    setWeekly(w);
  }, []);

  const loadRecs = useCallback(async () => {
    setRecErr('');
    try {
      const r = await api('/recommendations');
      setRecs(r);
    } catch (ex) {
      setRecErr(ex.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (today) loadRecs();
  }, [today, loadRecs]);

  async function removeEntry(id) {
    if (!window.confirm('Delete this entry?')) return;
    await api(`/logs/${id}`, { method: 'DELETE' });
    await load();
    await loadRecs();
  }

  async function logQuick(item) {
    setBusyId(item.food_name);
    try {
      await api('/logs/quick', {
        method: 'POST',
        body: JSON.stringify({
          food_name: item.food_name,
          estimated_calories: item.estimated_calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          meal_type: 'snack',
        }),
      });
      await load();
      await loadRecs();
    } catch (ex) {
      setRecErr(ex.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!today) return <p className="muted">Loading dashboard…</p>;

  const goal = today.daily_calorie_goal;
  const consumed = today.consumed_calories;
  const remaining = today.remaining_calories;
  const pct = goal ? Math.min(100, Math.round((consumed / goal) * 100)) : null;

  const macroData = [
    { name: 'Protein', value: Math.round(today.total_protein_g * 4) },
    { name: 'Carbs', value: Math.round(today.total_carbs_g * 4) },
    { name: 'Fat', value: Math.round(today.total_fat_g * 9) },
  ].filter((d) => d.value > 0);

  const weekBars =
    weekly?.days?.map((d) => ({
      day: d.date.slice(5),
      consumed: d.consumed_calories,
      goal: d.goal ?? 0,
    })) ?? [];

  return (
    <div className="page dashboard">
      <h1>Today</h1>
      <p className="muted">{today.date}</p>

      <div className="grid-2">
        <div className="card stat-card">
          <h2>Calories</h2>
          <p className="stat-big">{consumed}</p>
          <p className="muted">consumed kcal</p>
          {goal != null && (
            <>
              <p className="stat-sub">
                Goal {goal} · Remaining{' '}
                <strong>{remaining != null ? Math.max(remaining, 0) : '—'}</strong>
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
          {goal == null && <p className="notice">Set a daily goal in Settings for a progress bar.</p>}
        </div>

        <div className="card">
          <h2>Macros (kcal from macros)</h2>
          {macroData.length === 0 ? (
            <p className="muted">Log a meal to see macro mix.</p>
          ) : (
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={macroData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={88}>
                    {macroData.map((_, i) => (
                      <Cell key={i} fill={MACRO_COLORS[i % MACRO_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>What should I eat?</h2>
          <button type="button" className="btn ghost small" onClick={loadRecs}>
            Refresh
          </button>
        </div>
        {recErr && <div className="error-banner">{recErr}</div>}
        {!recs && !recErr && <p className="muted">Loading suggestions…</p>}
        {recs?.items?.length === 0 && (
          <p className="muted">Log something today and set a calorie goal to get personalized ideas.</p>
        )}
        <div className="rec-grid">
          {recs?.items?.map((item, i) => (
            <div key={i} className="rec-card">
              <h3>{item.food_name}</h3>
              <p className="rec-cals">{item.estimated_calories} kcal</p>
              <p className="muted small">{item.reason}</p>
              <button
                type="button"
                className="btn primary small"
                disabled={busyId === item.food_name}
                onClick={() => logQuick(item)}
              >
                {busyId === item.food_name ? 'Logging…' : 'Log this'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Weekly intake</h2>
        {weekBars.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weekBars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
              <Bar dataKey="consumed" fill="var(--accent)" name="Consumed" radius={[4, 4, 0, 0]} />
              {goal != null && <ReferenceLine y={goal} stroke="var(--accent-2)" strokeDasharray="4 4" />}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2>Recent entries</h2>
        {today.recent_entries?.length === 0 && <p className="muted">No entries yet. Log your first meal.</p>}
        <ul className="entry-list">
          {today.recent_entries?.map((e) => (
            <li key={e.id} className="entry-row">
              <div>
                <strong>{e.meal_type}</strong>
                <span className="muted"> · {e.total_calories} kcal</span>
                <p className="small muted">{e.description_text || e.items?.map((i) => i.name).join(', ')}</p>
              </div>
              <button type="button" className="btn danger ghost small" onClick={() => removeEntry(e.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
