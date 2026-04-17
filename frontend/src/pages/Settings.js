import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, refreshUser, logout } = useAuth();
  const nav = useNavigate();
  const [goal, setGoal] = useState(user?.daily_calorie_goal?.toString() ?? '');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [wWeight, setWWeight] = useState('');
  const [wActivity, setWActivity] = useState('moderate');

  useEffect(() => {
    if (user?.daily_calorie_goal != null) setGoal(String(user.daily_calorie_goal));
    else setGoal('');
  }, [user]);

  function suggestCalories() {
    const lbs = parseFloat(wWeight);
    if (Number.isNaN(lbs) || lbs < 60 || lbs > 500) {
      setErr('Enter a reasonable weight in pounds (60–500).');
      return;
    }
    const mult = wActivity === 'sedentary' ? 12 : wActivity === 'moderate' ? 14 : 16;
    const suggested = Math.round(lbs * mult);
    setGoal(String(Math.min(10000, Math.max(500, suggested))));
    setErr('');
    setOk(`Suggested ${suggested} kcal/day based on weight × activity factor. Adjust as needed.`);
  }

  async function saveGoal() {
    setErr('');
    setOk('');
    const body = {};
    if (goal.trim() === '') {
      body.daily_calorie_goal = null;
    } else {
      const n = parseInt(goal, 10);
      if (Number.isNaN(n) || n < 500 || n > 10000) {
        setErr('Goal must be between 500 and 10,000, or leave empty to clear.');
        return;
      }
      body.daily_calorie_goal = n;
    }
    try {
      await api('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      await refreshUser();
      setOk('Saved.');
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="page">
      <h1>Profile &amp; goals</h1>
      <p className="muted">Signed in as {user?.email}</p>

      <div className="card">
        <h2>Daily calorie target</h2>
        <label>
          Target (kcal)
          <input
            type="number"
            min={500}
            max={10000}
            placeholder="500–10000, empty to clear"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        {err && <div className="error-banner">{err}</div>}
        {ok && <div className="success-banner">{ok}</div>}
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={saveGoal}>
            Save goal
          </button>
        </div>
      </div>

      <div className="card">
        <button type="button" className="btn ghost" onClick={() => setShowWizard((s) => !s)}>
          {showWizard ? 'Hide' : 'Help me figure this out'}
        </button>
        {showWizard && (
          <div className="wizard">
            <p className="muted small">
              Rough estimate: weight (lb) × factor by activity. Not medical advice — adjust with a
              professional if needed.
            </p>
            <label>
              Current weight (lb)
              <input type="number" value={wWeight} onChange={(e) => setWWeight(e.target.value)} />
            </label>
            <label>
              Activity
              <select value={wActivity} onChange={(e) => setWActivity(e.target.value)}>
                <option value="sedentary">Mostly seated</option>
                <option value="moderate">Moderate exercise</option>
                <option value="active">Very active</option>
              </select>
            </label>
            <button type="button" className="btn secondary" onClick={suggestCalories}>
              Suggest target
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Session</h2>
        <button
          type="button"
          className="btn danger"
          onClick={async () => {
            await logout();
            nav('/login', { replace: true });
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
