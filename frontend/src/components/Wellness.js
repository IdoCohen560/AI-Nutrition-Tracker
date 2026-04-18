import { useCallback, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';

const tz = () => new Date().getTimezoneOffset();
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --------------- Weight ---------------
export function WeightCard({ user, onSaved }) {
  const useMetric = user?.use_metric ?? true;
  const [history, setHistory] = useState([]);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setHistory(await api('/weight?days=90')); } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setErr('');
    if (!val) return;
    const n = parseFloat(val);
    if (Number.isNaN(n)) { setErr('Enter a number'); return; }
    const kg = useMetric ? n : n / 2.20462;
    setBusy(true);
    try {
      await api('/weight', { method: 'POST', body: JSON.stringify({ weight_kg: kg, tz_offset: tz() }) });
      setVal('');
      await load();
      onSaved && onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const chart = history.map((h) => ({
    date: h.recorded_for.slice(5),
    weight: useMetric ? h.weight_kg : Math.round(h.weight_kg * 2.20462 * 10) / 10,
  }));
  const unit = useMetric ? 'kg' : 'lb';

  return (
    <div className="card">
      <div className="card-header"><h2>Weight</h2></div>
      <div className="weight-input">
        <input type="number" step="0.1" placeholder={`Today's weight (${unit})`} value={val} onChange={(e) => setVal(e.target.value)} />
        <button type="button" className="btn primary small" disabled={busy || !val} onClick={save}>
          {busy ? 'Saving…' : 'Log'}
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      {chart.length === 0 ? (
        <p className="muted small" style={{ marginTop: '0.75rem' }}>No weight entries yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} domain={['dataMin - 1', 'dataMax + 1']} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} formatter={(v) => `${v} ${unit}`} />
            <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --------------- Water ---------------
export function WaterCard({ goal = 8 }) {
  const [cups, setCups] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCups((await api(`/water?tz=${tz()}`)).cups); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function adjust(delta) {
    setBusy(true);
    try {
      const r = await api('/water', { method: 'POST', body: JSON.stringify({ delta, tz_offset: tz() }) });
      setCups(r.cups);
    } finally { setBusy(false); }
  }

  const pct = Math.min(100, (cups / goal) * 100);
  const cells = Array.from({ length: Math.max(goal, cups) }, (_, i) => i < cups);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Water</h2>
        <span className="muted small">{cups} / {goal} cups</span>
      </div>
      <div className="water-cells">
        {cells.map((filled, i) => (
          <span key={i} className={`water-cell ${filled ? 'on' : ''}`}>💧</span>
        ))}
      </div>
      <div className="progress-track" style={{ marginTop: '0.5rem' }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="btn-row">
        <button type="button" className="btn ghost small" disabled={busy || cups <= 0} onClick={() => adjust(-1)}>− 1 cup</button>
        <button type="button" className="btn primary small" disabled={busy} onClick={() => adjust(1)}>+ 1 cup</button>
      </div>
    </div>
  );
}

// --------------- Fasting ---------------
export function FastingCard() {
  const [status, setStatus] = useState({ active: false });
  const [target, setTarget] = useState(16);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try { setStatus(await api('/fast')); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!status.active) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [status.active]);

  const elapsedHrs = useMemo(() => {
    if (!status.active || !status.started_at) return 0;
    return (now - new Date(status.started_at).getTime()) / 3_600_000;
  }, [status, now]);

  async function start() {
    const r = await api('/fast/start', { method: 'POST', body: JSON.stringify({ target_hours: target }) });
    setStatus(r);
  }
  async function stop() {
    const r = await api('/fast/stop', { method: 'POST' });
    setStatus(r);
  }

  if (!status.active) {
    return (
      <div className="card">
        <div className="card-header"><h2>Fasting</h2></div>
        <label>
          Target hours
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            <option value={12}>12 h (overnight)</option>
            <option value={14}>14 h</option>
            <option value={16}>16 h (16:8)</option>
            <option value={18}>18 h (18:6)</option>
            <option value={20}>20 h</option>
            <option value={24}>24 h (OMAD)</option>
          </select>
        </label>
        <div className="btn-row">
          <button type="button" className="btn primary small" onClick={start}>Start fast</button>
        </div>
      </div>
    );
  }

  const tgt = status.target_hours || target;
  const pct = Math.min(100, (elapsedHrs / tgt) * 100);
  const remaining = Math.max(0, tgt - elapsedHrs);
  return (
    <div className="card">
      <div className="card-header"><h2>Fasting</h2></div>
      <p className="stat-big" style={{ margin: 0 }}>{Math.floor(elapsedHrs)}h {Math.round((elapsedHrs % 1) * 60)}m</p>
      <p className="muted small">{remaining > 0 ? `${remaining.toFixed(1)} h to ${tgt} h goal` : `Goal reached! +${(elapsedHrs - tgt).toFixed(1)} h`}</p>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="btn-row">
        <button type="button" className="btn danger small" onClick={stop}>End fast</button>
      </div>
    </div>
  );
}

// --------------- Stats (streak + diet score) ---------------
export function StatsCard({ refreshKey }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api(`/stats?tz=${tz()}`).then(setStats).catch(() => {});
  }, [refreshKey]);
  if (!stats) return null;
  const score = stats.diet_score;
  const scoreColor = score == null ? 'var(--muted)' : score >= 75 ? 'var(--accent)' : score >= 50 ? 'var(--accent-2)' : 'var(--danger)';
  const label = score == null ? '—' : score >= 75 ? 'Great' : score >= 50 ? 'OK' : 'Low';
  return (
    <div className="card stats-card">
      <div className="stats-grid">
        <div>
          <p className="muted small" style={{ margin: 0 }}>Streak</p>
          <p className="stat-big" style={{ margin: 0 }}>🔥 {stats.streak_days}</p>
          <p className="muted small">{stats.streak_days === 1 ? 'day' : 'days'}</p>
        </div>
        <div>
          <p className="muted small" style={{ margin: 0 }}>Diet score</p>
          <p className="stat-big" style={{ margin: 0, color: scoreColor }}>{score ?? '—'}</p>
          <p className="muted small">{label}</p>
        </div>
      </div>
    </div>
  );
}

export { todayISO };
