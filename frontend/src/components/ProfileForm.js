import { useEffect, useState } from 'react';

const SEX_OPTIONS = [
  { v: '', l: 'Prefer not to say' },
  { v: 'male', l: 'Male' },
  { v: 'female', l: 'Female' },
  { v: 'other', l: 'Other' },
];

const ACTIVITY_OPTIONS = [
  { v: '', l: '— select —' },
  { v: 'sedentary', l: 'Sedentary (little/no exercise)' },
  { v: 'light', l: 'Lightly active (1–3 days/wk)' },
  { v: 'moderate', l: 'Moderately active (3–5 days/wk)' },
  { v: 'active', l: 'Very active (6–7 days/wk)' },
  { v: 'very_active', l: 'Extra active (athlete / physical job)' },
];

const GOAL_OPTIONS = [
  { v: '', l: '— select —' },
  { v: 'lose', l: 'Lose weight' },
  { v: 'maintain', l: 'Maintain weight' },
  { v: 'gain', l: 'Gain weight / muscle' },
  { v: 'recomp', l: 'Recomposition' },
];

const RESTRICTION_OPTIONS = [
  { v: 'vegetarian', l: 'Vegetarian' },
  { v: 'vegan', l: 'Vegan' },
  { v: 'pescatarian', l: 'Pescatarian' },
  { v: 'gluten_free', l: 'Gluten-free' },
  { v: 'dairy_free', l: 'Dairy-free' },
  { v: 'nut_free', l: 'Nut-free' },
  { v: 'halal', l: 'Halal' },
  { v: 'kosher', l: 'Kosher' },
  { v: 'low_carb', l: 'Low carb' },
  { v: 'keto', l: 'Keto' },
];

function bmi(h, w) {
  if (!h || !w) return null;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

function bmiLabel(b) {
  if (b == null) return '';
  if (b < 18.5) return 'Underweight';
  if (b < 25) return 'Healthy';
  if (b < 30) return 'Overweight';
  return 'Obese';
}

export default function ProfileForm({ initial, onSubmit, submitLabel = 'Save', busy = false, children }) {
  const [sex, setSex] = useState(initial?.sex || '');
  const [dob, setDob] = useState(initial?.date_of_birth || '');
  const initMetric = initial?.use_metric ?? false;
  // Height: metric uses cm; imperial uses ft + in split.
  const initTotalIn = initial?.height_cm ? initial.height_cm / 2.54 : null;
  const [heightCm, setHeightCm] = useState(
    initial?.height_cm ? String(initial.height_cm) : ''
  );
  const [heightFt, setHeightFt] = useState(initTotalIn != null ? String(Math.floor(initTotalIn / 12)) : '');
  const [heightIn, setHeightIn] = useState(initTotalIn != null ? String(Math.round(initTotalIn - Math.floor(initTotalIn / 12) * 12)) : '');
  const [weight, setWeight] = useState(
    initial?.weight_kg ? (initMetric ? initial.weight_kg : Math.round(initial.weight_kg * 2.20462 * 10) / 10).toString() : ''
  );
  const [activity, setActivity] = useState(initial?.activity_level || '');
  const [goal, setGoal] = useState(initial?.fitness_goal || '');
  const [restrictions, setRestrictions] = useState(new Set(initial?.dietary_restrictions || []));
  const [allergies, setAllergies] = useState((initial?.allergies || []).join(', '));
  const [dislikes, setDislikes] = useState((initial?.dislikes || []).join(', '));
  const [notes, setNotes] = useState(initial?.notes || '');
  const [calorieGoal, setCalorieGoal] = useState(initial?.daily_calorie_goal?.toString() || '');
  const [useMetric, setUseMetric] = useState(initial?.use_metric ?? false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!initial) return;
    setSex(initial.sex || '');
    setDob(initial.date_of_birth || '');
    {
      const m = initial.use_metric ?? false;
      setHeightCm(initial.height_cm ? String(initial.height_cm) : '');
      if (initial.height_cm) {
        const totIn = initial.height_cm / 2.54;
        setHeightFt(String(Math.floor(totIn / 12)));
        setHeightIn(String(Math.round(totIn - Math.floor(totIn / 12) * 12)));
      } else {
        setHeightFt(''); setHeightIn('');
      }
      setWeight(initial.weight_kg ? (m ? initial.weight_kg : Math.round(initial.weight_kg * 2.20462 * 10) / 10).toString() : '');
    }
    setActivity(initial.activity_level || '');
    setGoal(initial.fitness_goal || '');
    setRestrictions(new Set(initial.dietary_restrictions || []));
    setAllergies((initial.allergies || []).join(', '));
    setDislikes((initial.dislikes || []).join(', '));
    setNotes(initial.notes || '');
    setCalorieGoal(initial.daily_calorie_goal?.toString() || '');
    setUseMetric(initial.use_metric ?? false);
  }, [initial]);

  const w = parseFloat(weight);
  // Resolve height in cm regardless of unit system
  let hCm = null;
  if (useMetric) {
    const cm = parseFloat(heightCm);
    if (!Number.isNaN(cm) && cm > 0) hCm = cm;
  } else {
    const ft = parseFloat(heightFt) || 0;
    const inches = parseFloat(heightIn) || 0;
    if (ft > 0 || inches > 0) hCm = (ft * 12 + inches) * 2.54;
  }
  const wKg = useMetric ? w : w / 2.20462;
  const currentBmi = bmi(hCm, wKg);

  function toggleRestriction(v) {
    setRestrictions((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  function splitCsv(s) {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    const weightVal = weight ? parseFloat(weight) : null;
    // Build height_cm based on active unit system
    let height_cm = null;
    if (useMetric) {
      const cm = heightCm ? parseFloat(heightCm) : null;
      if (cm && cm > 0) height_cm = cm;
    } else {
      const ft = heightFt ? parseFloat(heightFt) : 0;
      const inches = heightIn ? parseFloat(heightIn) : 0;
      if (ft > 0 || inches > 0) height_cm = (ft * 12 + inches) * 2.54;
    }
    const body = {
      sex: sex || null,
      date_of_birth: dob || null,
      height_cm,
      weight_kg: weightVal != null ? (useMetric ? weightVal : weightVal / 2.20462) : null,
      use_metric: useMetric,
      activity_level: activity || null,
      fitness_goal: goal || null,
      dietary_restrictions: Array.from(restrictions),
      allergies: splitCsv(allergies),
      dislikes: splitCsv(dislikes),
      notes,
    };
    if (calorieGoal !== '') {
      const n = parseInt(calorieGoal, 10);
      if (Number.isNaN(n) || n < 500 || n > 10000) {
        setErr('Daily calorie goal must be 500–10,000 (or leave blank).');
        return;
      }
      body.daily_calorie_goal = n;
    } else {
      body.daily_calorie_goal = null;
    }
    try {
      await onSubmit(body);
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <div className="card-header">
          <h2>Basics</h2>
          <div className="range-toggle small" style={{ maxWidth: 160 }}>
            <button type="button" className={useMetric ? 'active' : ''} onClick={() => setUseMetric(true)}>Metric</button>
            <button type="button" className={!useMetric ? 'active' : ''} onClick={() => setUseMetric(false)}>Imperial</button>
          </div>
        </div>
        <div className="grid-2">
          <label>
            Sex
            <select value={sex} onChange={(e) => setSex(e.target.value)}>
              {SEX_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
          <label>
            Date of birth
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </label>
          {useMetric ? (
            <label>
              Height (cm)
              <input type="number" step="0.1" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </label>
          ) : (
            <label>
              Height
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number" inputMode="numeric" min="0" max="8"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label="Height in feet"
                />
                <span className="muted small">ft</span>
                <input
                  type="number" inputMode="numeric" min="0" max="11" step="1"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label="Height in inches"
                />
                <span className="muted small">in</span>
              </div>
            </label>
          )}
          <label>
            Weight ({useMetric ? 'kg' : 'lb'})
            <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
        </div>
        {currentBmi != null && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            BMI: <strong>{currentBmi}</strong> ({bmiLabel(currentBmi)})
          </p>
        )}
      </div>

      <div className="card">
        <h2>Activity & goal</h2>
        <div className="grid-2">
          <label>
            Activity level
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              {ACTIVITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
          <label>
            Fitness goal
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              {GOAL_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
          <label>
            Daily calorie target
            <input type="number" min="500" max="10000" placeholder="optional, e.g. 2000" value={calorieGoal} onChange={(e) => setCalorieGoal(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Diet</h2>
        <p className="muted small">Pick any that apply. Recommendations will exclude foods that conflict.</p>
        <div className="chip-group">
          {RESTRICTION_OPTIONS.map((o) => (
            <button
              type="button"
              key={o.v}
              className={`chip ${restrictions.has(o.v) ? 'on' : ''}`}
              onClick={() => toggleRestriction(o.v)}
            >
              {o.l}
            </button>
          ))}
        </div>
        <label style={{ marginTop: '1rem' }}>
          Allergies (comma separated)
          <input type="text" placeholder="e.g. peanuts, shellfish, eggs" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        </label>
        <label>
          Dislikes (comma separated)
          <input type="text" placeholder="e.g. mushrooms, cilantro" value={dislikes} onChange={(e) => setDislikes(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <h2>Extra notes</h2>
        <p className="muted small">Anything else we should keep in mind for recommendations.</p>
        <textarea rows={4} placeholder="e.g. trying to hit 150g protein, prefer Mediterranean meals, lactose intolerant after dinner" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {err && <div className="error-banner">{err}</div>}
      <div className="btn-row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
      {children && <div className="btn-row">{children}</div>}
    </form>
  );
}
