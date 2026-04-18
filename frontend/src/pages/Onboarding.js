import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ProfileForm from '../components/ProfileForm';

export default function Onboarding() {
  const { refreshUser, user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.onboarding_completed) nav('/dashboard', { replace: true });
  }, [user, nav]);

  async function handleSubmit(body) {
    setBusy(true);
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ ...body, onboarding_completed: true }),
      });
      await refreshUser();
      nav('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ onboarding_completed: true }),
      });
      await refreshUser();
      nav('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Welcome to NutriBoo AI</h1>
      <p className="muted">
        Tell us a bit about yourself so we can tailor your nutrition tracking and recommendations.
        Everything here can be edited later in Settings.
      </p>
      <ProfileForm initial={user} onSubmit={handleSubmit} submitLabel="Save & continue" busy={busy}>
        <button type="button" className="btn ghost" onClick={skip} disabled={busy}>
          Skip for now
        </button>
      </ProfileForm>
    </div>
  );
}
