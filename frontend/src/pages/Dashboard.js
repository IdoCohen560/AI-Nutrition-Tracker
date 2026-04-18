import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { api } from '../api';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_EMOJI = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snacks: '🥤' };
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

const COLOR = {
  fat: '#f59e0b',
  carbs: '#38bdf8',
  protein: '#8b5cf6',
  good: '#22c55e',
  bad: '#ef4444',
  ringTrack: '#334155',
};

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState('daily');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const d = await api(`/dashboard/breakdown?date=${date}&range=${range}`);
      setData(d);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [date, range]);

  useEffect(() => {
    load();
  }, [load]);

  const macros = data?.macros;

  const macroPie = useMemo(() => {
    if (!macros) return [];
    const fatKcal = (macros.fat?.grams || 0) * 9;
    const carbKcal = (macros.carbs?.grams || 0) * 4;
    const proKcal = (macros.protein?.grams || 0) * 4;
    const total = fatKcal + carbKcal + proKcal;
    if (total === 0) return [];
    return [
      { name: 'Fat', value: fatKcal, color: COLOR.fat },
      { name: 'Carbs', value: carbKcal, color: COLOR.carbs },
      { name: 'Protein', value: proKcal, color: COLOR.protein },
    ];
  }, [macros]);

  const cal = data?.calories;
  const ringPct = useMemo(() => {
    if (!cal?.budget) return 0;
    return Math.min(100, Math.max(0, (cal.net / cal.budget) * 100));
  }, [cal]);

  const ringColor = cal?.state === 'over' ? COLOR.bad : COLOR.good;
  const ringData = [
    { name: 'used', value: ringPct, color: ringColor },
    { name: 'left', value: 100 - ringPct, color: COLOR.ringTrack },
  ];

  return (
    <div className="page nb-dashboard">
      <div className="nb-toprow">
        <button type="button" className="nb-iconbtn" onClick={() => setDate(shiftDate(date, -1))}>
          ‹
        </button>
        <input
          type="date"
          className="nb-dateinput"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <span className="nb-datelabel">{fmtDate(date)}</span>
        <button type="button" className="nb-iconbtn" onClick={() => setDate(shiftDate(date, 1))}>
          ›
        </button>
      </div>

      <div className="nb-toggle">
        <button
          type="button"
          className={range === 'daily' ? 'active' : ''}
          onClick={() => setRange('daily')}
        >
          Daily
        </button>
        <button
          type="button"
          className={range === 'weekly' ? 'active' : ''}
          onClick={() => setRange('weekly')}
        >
          Weekly
        </button>
      </div>

      {err && <div className="error-banner">{err}</div>}
      {!data && !err && <p className="muted">Loading…</p>}

      {data && (
        <>
          <div className="nb-card nb-ring-card">
            <div className="nb-ring">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ringData}
                    dataKey="value"
                    innerRadius={78}
                    outerRadius={104}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {ringData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="nb-ring-center">
                <div className="nb-ring-num" style={{ color: ringColor }}>
                  {cal?.delta != null ? Math.abs(Math.round(cal.delta)) : fmtNum(cal?.net)}
                </div>
                <div className="nb-ring-label">
                  {cal?.state === 'over' ? 'Over' : cal?.state === 'under' ? 'Under' : 'Net'}
                </div>
              </div>
            </div>
            <ul className="nb-cal-list">
              <li>
                <span>Food calories consumed</span>
                <span>{fmtNum(cal?.consumed)}</span>
              </li>
              <li>
                <span>Exercise calories burned</span>
                <span>{fmtNum(cal?.burned)}</span>
              </li>
              <li className="nb-divider">
                <span>Net calories</span>
                <span>{fmtNum(cal?.net)}</span>
              </li>
              <li>
                <span>Daily calorie budget</span>
                <span>{fmtNum(cal?.budget)}</span>
              </li>
              <li className="nb-divider">
                <span>Calories {cal?.state === 'over' ? 'over' : 'under'} budget</span>
                <span style={{ color: ringColor }}>
                  {cal?.delta != null ? Math.abs(Math.round(cal.delta)) : '—'}
                </span>
              </li>
            </ul>
            {cal?.budget == null && (
              <p className="nb-tip">💡 Set a daily calorie goal in Settings to track your budget.</p>
            )}
          </div>

          <div className="nb-card">
            <h2 className="nb-card-title">Nutrition breakdown</h2>
            {macroPie.length === 0 ? (
              <p className="muted">Log a meal to see your macro mix.</p>
            ) : (
              <>
                <div className="nb-pie-wrap">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={macroPie}
                        dataKey="value"
                        innerRadius={0}
                        outerRadius={92}
                        stroke="none"
                      >
                        {macroPie.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="nb-macro-legend">
                  <MacroRow color={COLOR.fat} label="Fat" grams={macros.fat?.grams} dv={macros.fat?.pct_dv} />
                  <SubRow label="Saturated Fat" grams={macros.saturated_fat?.grams} />
                  <SubRow label="Cholesterol" grams={macros.cholesterol?.mg} unit="mg" />
                  <SubRow label="Sodium" grams={macros.sodium?.mg} unit="mg" />
                  <MacroRow
                    color={COLOR.carbs}
                    label="Carbohydrates"
                    grams={macros.carbs?.grams}
                    dv={macros.carbs?.pct_dv}
                  />
                  <SubRow label="Fiber" grams={macros.fiber?.grams} />
                  <SubRow label="Sugars" grams={macros.sugars?.grams} />
                  <MacroRow
                    color={COLOR.protein}
                    label="Protein"
                    grams={macros.protein?.grams}
                    dv={macros.protein?.pct_dv}
                  />
                </ul>
              </>
            )}
          </div>

          {range === 'daily' && data.meals && (
            <div className="nb-meals">
              {MEAL_ORDER.map((mt) => {
                const meal = data.meals[mt] || { calories: 0, items: [] };
                return (
                  <div key={mt} className="nb-card nb-meal">
                    <div className="nb-meal-header">
                      <h3>
                        {MEAL_LABEL[mt]}: {fmtNum(meal.calories)} cals
                      </h3>
                      <button type="button" className="nb-iconbtn ghost">⋯</button>
                    </div>
                    {meal.items?.length > 0 ? (
                      <ul className="nb-item-list">
                        {meal.items.map((it, i) => (
                          <li key={i} className="nb-item">
                            <span className="nb-item-icon">{MEAL_EMOJI[mt]}</span>
                            <div className="nb-item-body">
                              <div className="nb-item-name">{it.name}</div>
                              <div className="nb-item-serving">
                                {it.serving || `${it.quantity || 1} serving`}
                              </div>
                            </div>
                            <div className="nb-item-cals">{fmtNum(it.calories)}</div>
                          </li>
                        ))}
                      </ul>
                    ) : mt === 'snacks' && meal.suggested_calories ? (
                      <p className="nb-suggest">💡 {meal.suggested_calories} calories suggested</p>
                    ) : (
                      <p className="muted small">No items logged.</p>
                    )}
                    <Link to={`/log?meal=${mt === 'snacks' ? 'snack' : mt}`} className="nb-addfood">
                      Add Food
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MacroRow({ color, label, grams, dv }) {
  return (
    <li className="nb-macro-row">
      <span className="nb-dot" style={{ background: color }} />
      <span className="nb-macro-label">{label}</span>
      <span className="nb-macro-grams">{fmtNum(grams)}g</span>
      <span className="nb-macro-dv">{dv != null ? `${dv}%` : ''}</span>
    </li>
  );
}

function SubRow({ label, grams, unit = 'g' }) {
  return (
    <li className="nb-macro-row sub">
      <span className="nb-dot transparent" />
      <span className="nb-macro-label">{label}</span>
      <span className="nb-macro-grams">
        {fmtNum(grams)}
        {unit}
      </span>
      <span className="nb-macro-dv" />
    </li>
  );
}
