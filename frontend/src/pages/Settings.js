import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ProfileForm from '../components/ProfileForm';

export default function Settings() {
  const { user, refreshUser, logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');

  async function handleSubmit(body) {
    setOk('');
    setBusy(true);
    try {
      await api('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      await refreshUser();
      setOk('Saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Profile &amp; goals</h1>
      <p className="muted">Signed in as {user?.email}</p>

      {ok && <div className="success-banner">{ok}</div>}

      <ProfileForm initial={user} onSubmit={handleSubmit} submitLabel="Save profile" busy={busy} />

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
