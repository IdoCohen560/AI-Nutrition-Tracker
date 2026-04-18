import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import Calendar from '../components/Calendar';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_EMOJI = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snacks: '🥤' };
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftDate(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Dashboard() {
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState('daily');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const dateInputRef = useRef(null);

  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  }

  const load = useCallback(async () => {
    setErr('');
    try {
      const d = await api(`/dashboard/breakdown?date=${date}&range=${range}`);
      setData(d);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [date, range]);

  useEffect(() => { load(); }, [load]);

  const macros = data?.macros;
  const cal = data?.calories;

  const macroPie = useMemo(() => {
    if (!macros) return [];
    const f = (macros.fat?.grams || 0) * 9;
    const c = (macros.carbs?.grams || 0) * 4;
    const p = (macros.protein?.grams || 0) * 4;
    if (f + c + p === 0) return [];
    return [
      { name: 'Fat', value: f, color: 'var(--chart-fat)' },
      { name: 'Carbs', value: c, color: 'var(--chart-carbs)' },
      { name: 'Protein', value: p, color: 'var(--chart-protein)' },
    ];
  }, [macros]);

  const ringPct = cal?.budget ? Math.min(100, Math.max(0, (cal.net / cal.budget) * 100)) : 0;
  const ringColor = cal?.state === 'over' ? 'var(--accent-2)' : 'var(--accent)';
  const ringData = [
    { value: ringPct, color: ringColor },
    { value: 100 - ringPct, color: 'var(--border)' },
  ];

  return (
    <div className="page dashboard">
      <div className="date-scrubber">
        <button type="button" className="btn ghost small" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
        <button type="button" className="date-trigger" onClick={openPicker}>
          <span className="date-cal">📅</span>
          <span>{fmtDate(date)}</span>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="date-input-hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button type="button" className="btn ghost small" onClick={() => setDate(shiftDate(date, 1))}>›</button>
      </div>

      <Calendar />

      <div className="range-toggle">
        <button type="button" className={range === 'daily' ? 'active' : ''} onClick={() => setRange('daily')}>Daily</button>
        <button type="button" className={range === 'weekly' ? 'active' : ''} onClick={() => setRange('weekly')}>Weekly</button>
      </div>

      {err && <div className="error-banner">{err}</div>}
      {!data && !err && <p className="muted">Loading…</p>}

      {data && (
        <>
          <div className="grid-2">
            <div className="card stat-card">
              <h2>Calories</h2>
              <div className="ring-wrap">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={ringData} dataKey="value" innerRadius={70} outerRadius={92}
                         startAngle={90} endAngle={-270} stroke="none">
                      {ringData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="ring-center">
                  <strong className="ring-num" style={{ color: ringColor }}>
                    {cal?.delta != null ? Math.abs(Math.round(cal.delta)) : fmtNum(cal?.net)}
                  </strong>
                  <span className="muted">{cal?.state === 'over' ? 'Over' : cal?.state === 'under' ? 'Under' : 'Net'}</span>
                </div>
              </div>
              <ul className="cal-list">
                <li><span>Food calories consumed</span><span>{fmtNum(cal?.consumed)}</span></li>
                <li><span>Exercise calories burned</span><span>{fmtNum(cal?.burned)}</span></li>
                <li className="divider"><span>Net calories</span><span>{fmtNum(cal?.net)}</span></li>
                <li><span>Daily calorie budget</span><span>{fmtNum(cal?.budget)}</span></li>
                <li className="divider"><span>Calories {cal?.state === 'over' ? 'over' : 'under'} budget</span>
                  <span style={{ color: ringColor }}>{cal?.delta != null ? Math.abs(Math.round(cal.delta)) : '—'}</span>
                </li>
              </ul>
              {cal?.budget == null && <p className="notice">Set a daily goal in Settings to track your budget.</p>}
            </div>

            <div className="card">
              <h2>Nutrition breakdown</h2>
              {macroPie.length === 0 ? (
                <p className="muted">Log a meal to see your macro mix.</p>
              ) : (
                <>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={macroPie} dataKey="value" outerRadius={88} stroke="none">
                          {macroPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="macro-legend">
                    <MacroRow color="var(--chart-fat)" label="Fat" v={macros.fat?.grams} u="g" dv={macros.fat?.pct_dv} />
                    <SubRow label="Saturated Fat" v={macros.saturated_fat?.grams} u="g" />
                    <SubRow label="Cholesterol" v={macros.cholesterol?.mg} u="mg" />
                    <SubRow label="Sodium" v={macros.sodium?.mg} u="mg" />
                    <MacroRow color="var(--chart-carbs)" label="Carbohydrates" v={macros.carbs?.grams} u="g" dv={macros.carbs?.pct_dv} />
                    <SubRow label="Fiber" v={macros.fiber?.grams} u="g" />
                    <SubRow label="Sugars" v={macros.sugars?.grams} u="g" />
                    <MacroRow color="var(--chart-protein)" label="Protein" v={macros.protein?.grams} u="g" dv={macros.protein?.pct_dv} />
                  </ul>
                </>
              )}
            </div>
          </div>

          {range === 'daily' && data.meals && (
            <>
              {MEAL_ORDER.map((mt) => {
                const meal = data.meals[mt] || { calories: 0, items: [] };
                return (
                  <div key={mt} className="card meal-card">
                    <div className="card-header">
                      <h2>{MEAL_LABEL[mt]}: {fmtNum(meal.calories)} cals</h2>
                      <Link to={`/log?meal=${mt === 'snacks' ? 'snack' : mt}`} className="btn primary small">
                        Add Food
                      </Link>
                    </div>
                    {meal.items?.length > 0 ? (
                      <ul className="entry-list">
                        {meal.items.map((it, i) => (
                          <li key={i} className="entry-row meal-item">
                            <div>
                              <span className="meal-icon">{MEAL_EMOJI[mt]}</span>
                              <strong>{it.name}</strong>
                              <span className="muted small"> · {it.serving || `${it.quantity || 1} serving`}</span>
                            </div>
                            <span>{fmtNum(it.calories)} kcal</span>
                          </li>
                        ))}
                      </ul>
                    ) : mt === 'snacks' && meal.suggested_calories ? (
                      <p className="muted">💡 {meal.suggested_calories} calories suggested</p>
                    ) : (
                      <p className="muted small">No items logged.</p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}

function MacroRow({ color, label, v, u, dv }) {
  return (
    <li className="macro-row">
      <span className="macro-dot" style={{ background: color }} />
      <span className="macro-label">{label}</span>
      <span className="macro-val">{fmtNum(v)}{u}</span>
      <span className="macro-dv">{dv != null ? `${dv}%` : ''}</span>
    </li>
  );
}

function SubRow({ label, v, u }) {
  return (
    <li className="macro-row sub">
      <span className="macro-dot transparent" />
      <span className="macro-label">{label}</span>
      <span className="macro-val">{fmtNum(v)}{u}</span>
      <span className="macro-dv" />
    </li>
  );
}
