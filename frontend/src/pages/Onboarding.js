import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Onboarding() {
  const { refreshUser, user } = useAuth();
  const nav = useNavigate();
  const [goal, setGoal] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (user?.onboarding_completed) nav('/dashboard', { replace: true });
  }, [user, nav]);

  async function finish() {
    setErr('');
    const body = { onboarding_completed: true };
    if (goal.trim()) {
      const n = parseInt(goal, 10);
      if (Number.isNaN(n) || n < 500 || n > 10000) {
        setErr('Goal must be between 500 and 10,000 kcal, or clear the field.');
        return;
      }
      body.daily_calorie_goal = n;
    }
    try {
      await api('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      await refreshUser();
      nav('/dashboard', { replace: true });
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <h1>Welcome to AI Food Tracker</h1>
        <p className="muted">
          Describe meals in plain English, see today&apos;s totals, and get suggestions that fit your
          budget.
        </p>
        <label>
          Daily calorie target (optional)
          <input
            type="number"
            min={500}
            max={10000}
            placeholder="e.g. 2000 — leave empty to set later"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        {err && <div className="error-banner">{err}</div>}
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={finish}>
            Continue to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
