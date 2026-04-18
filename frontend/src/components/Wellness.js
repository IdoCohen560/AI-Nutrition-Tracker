import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getToken } from '../api';

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
export function WaterCard({ user, onUpdated }) {
  const goal = user?.water_goal_cups || 8;
  const [cups, setCups] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setCups((await api(`/water?tz=${tz()}`)).cups); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function adjust(delta) {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/water', { method: 'POST', body: JSON.stringify({ delta, tz_offset: tz() }) });
      setCups(r.cups);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  async function changeGoal(newGoal) {
    try {
      await api('/users/me', { method: 'PATCH', body: JSON.stringify({ water_goal_cups: newGoal }) });
      onUpdated && onUpdated();
    } catch (e) { setErr(e.message); }
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
      {err && <div className="error-banner">{err}</div>}
      <div className="btn-row">
        <button type="button" className="btn ghost small" disabled={busy || cups <= 0} onClick={() => adjust(-1)}>− 1</button>
        <button type="button" className="btn primary small" disabled={busy} onClick={() => adjust(1)}>+ 1 cup</button>
      </div>
      <label className="muted small" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        Daily goal:
        <select value={goal} onChange={(e) => changeGoal(Number(e.target.value))} style={{ width: 'auto', padding: '0.25rem 0.5rem' }}>
          {[4,5,6,7,8,9,10,11,12,14,16].map((n) => (
            <option key={n} value={n}>{n} cups{n === 8 ? ' (recommended)' : ''}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

// --------------- Fasting ---------------
const LOCAL_FAST_KEY = 'ai_food_tracker_local_fast';

function readLocalFast() {
  try {
    const raw = localStorage.getItem(LOCAL_FAST_KEY);
    if (!raw) return { active: false };
    const parsed = JSON.parse(raw);
    if (!parsed?.started_at) return { active: false };
    return { active: true, started_at: parsed.started_at, target_hours: parsed.target_hours || 16 };
  } catch { return { active: false }; }
}
function writeLocalFast(status) {
  if (status?.active && status.started_at) {
    localStorage.setItem(LOCAL_FAST_KEY, JSON.stringify({
      started_at: status.started_at, target_hours: status.target_hours || 16,
    }));
  } else {
    localStorage.removeItem(LOCAL_FAST_KEY);
  }
}

function playGoalBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    // Three-tone chime: C5 -> E5 -> G5
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.22;
      const end = start + 0.35;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch { /* audio not available */ }
}

export function FastingCard() {
  const authed = !!getToken();
  const [status, setStatus] = useState(() => (authed ? { active: false } : readLocalFast()));
  const [target, setTarget] = useState(16);
  const [now, setNow] = useState(Date.now());
  const goalFiredRef = useRef(false);

  const load = useCallback(async () => {
    if (!authed) { setStatus(readLocalFast()); return; }
    try { setStatus(await api('/fast')); } catch { /* ignore */ }
  }, [authed]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!status.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status.active]);

  // Reset the "goal already fired" flag whenever a new fast starts or stops.
  useEffect(() => {
    goalFiredRef.current = false;
  }, [status.active, status.started_at]);

  const elapsedSec = useMemo(() => {
    if (!status.active || !status.started_at) return 0;
    return Math.max(0, (now - new Date(status.started_at).getTime()) / 1000);
  }, [status, now]);
  const elapsedHrs = elapsedSec / 3600;

  // Chime once when the goal is first crossed in this session.
  // Two paths, both gated by goalFiredRef so it never repeats:
  //   1. The 1-second tick detects the crossing while the tab is in the foreground.
  //   2. A one-shot setTimeout fires at the exact goal moment — more reliable than
  //      the tick in background tabs (where setInterval gets heavily throttled).
  // If the fast already completed before mount (e.g., user re-logs in), path #1
  // fires immediately on first render.
  useEffect(() => {
    if (!status.active) return;
    const tgtH = status.target_hours || target;
    if (!tgtH) return;
    if (elapsedHrs >= tgtH && !goalFiredRef.current) {
      goalFiredRef.current = true;
      playGoalBeep();
    }
  }, [elapsedHrs, status.active, status.target_hours, target]);

  useEffect(() => {
    if (!status.active || !status.started_at) return;
    const tgtH = status.target_hours || target;
    if (!tgtH) return;
    const msRemaining = new Date(status.started_at).getTime() + tgtH * 3600 * 1000 - Date.now();
    if (msRemaining <= 0) return; // already past; path #1 handles it
    const id = setTimeout(() => {
      if (!goalFiredRef.current) {
        goalFiredRef.current = true;
        playGoalBeep();
      }
    }, msRemaining);
    return () => clearTimeout(id);
  }, [status.active, status.started_at, status.target_hours, target]);

  async function start() {
    if (!authed) {
      const next = { active: true, started_at: new Date().toISOString(), target_hours: target };
      writeLocalFast(next);
      setStatus(next);
      return;
    }
    const r = await api('/fast/start', { method: 'POST', body: JSON.stringify({ target_hours: target }) });
    setStatus(r);
  }
  async function stop() {
    if (!authed) {
      writeLocalFast(null);
      setStatus({ active: false });
      return;
    }
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
  const remainingSec = Math.max(0, tgt * 3600 - elapsedSec);
  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  return (
    <div className="card">
      <div className="card-header"><h2>Fasting</h2><span className="muted small">{tgt}h goal</span></div>
      <p className="stat-big" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(elapsedSec)}</p>
      <p className="muted small">{remainingSec > 0 ? `${fmt(remainingSec)} remaining` : `Goal reached! +${fmt(elapsedSec - tgt * 3600)} over`}</p>
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

// --------------- Adaptive calorie target ---------------
export function AdaptiveTargetCard({ user, onApplied }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setData(await api('/users/me/adaptive-target')); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function applyTarget() {
    if (!data) return;
    setBusy(true); setErr('');
    try {
      await api('/users/me', { method: 'PATCH', body: JSON.stringify({ daily_calorie_goal: data.suggested_calories }) });
      onApplied?.(data.suggested_calories);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!data) {
    return (
      <div className="card adaptive-card">
        <div className="card-header"><h2>Adaptive target</h2></div>
        <p className="muted">{err || 'Computing…'}</p>
      </div>
    );
  }

  const cur = data.current_goal;
  const suggested = data.suggested_calories;
  const diff = cur != null ? suggested - cur : null;

  return (
    <div className="card adaptive-card">
      <div className="card-header">
        <h2>Adaptive target</h2>
        <span className="muted small">suggested</span>
      </div>
      <p className="delta">{suggested.toLocaleString()} <span className="muted small">kcal/day</span></p>
      {diff != null && diff !== 0 && (
        <p className={diff > 0 ? 'positive' : 'negative'} style={{ margin: '0 0 0.25rem' }}>
          {diff > 0 ? `+${diff}` : diff} vs current goal ({cur})
        </p>
      )}
      <p className="reason">{data.reason}</p>
      {data.weight_trend_kg_per_week != null && (
        <p className="muted small" style={{ marginTop: '0.25rem' }}>
          Weight trend: {data.weight_trend_kg_per_week > 0 ? '+' : ''}{data.weight_trend_kg_per_week} kg/week
          {data.avg_logged_calories != null && ` · avg logged: ${data.avg_logged_calories} kcal/day`}
        </p>
      )}
      {cur !== suggested && (
        <div className="btn-row">
          <button type="button" className="btn primary small" disabled={busy} onClick={applyTarget}>
            {busy ? 'Applying…' : 'Apply as new goal'}
          </button>
        </div>
      )}
      {err && <p className="error-banner">{err}</p>}
    </div>
  );
}

// --------------- Daily steps (manual entry; placeholder for wearable sync) ---------------
export function StepsCard() {
  const [steps, setSteps] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api(`/steps?tz=${tz()}`);
      setSteps(r.steps || 0);
      setInput(String(r.steps || 0));
    } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    const n = Math.max(0, Math.floor(Number(input) || 0));
    if (n === steps) return;
    setBusy(true); setErr('');
    try {
      const r = await api('/steps', {
        method: 'POST',
        body: JSON.stringify({ steps: n, tz_offset: tz() }),
      });
      setSteps(r.steps);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // Rough calorie burn: ~0.04 kcal/step for a 70kg adult
  const burnedKcal = Math.round(steps * 0.04);

  return (
    <div className="card">
      <div className="card-header">
        <h2>Steps</h2>
        <span className="muted small">today · ~{burnedKcal} kcal</span>
      </div>
      <div className="steps-input">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter step count"
        />
        <button type="button" className="btn primary small" disabled={busy || String(steps) === input} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: '0.35rem' }}>
        Manual for now — Apple Health / Google Fit sync coming later.
      </p>
      {err && <p className="error-banner">{err}</p>}
    </div>
  );
}
