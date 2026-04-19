import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ProfileForm from '../components/ProfileForm';

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  async function handleSubmit(body) {
    setOk(''); setErr('');
    setBusy(true);
    try {
      // Use the PATCH response directly. Prevents a race where a second GET /users/me
      // could overwrite the freshly-saved state with a stale value.
      const updated = await api('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
      setUser(updated);
      setOk('Saved.');
    } catch (ex) {
      setErr(ex.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Profile &amp; goals</h1>
      <p className="muted">Signed in as {user?.email}</p>

      {ok && <div className="success-banner">{ok}</div>}
      {err && <div className="error-banner">{err}</div>}

      <ProfileForm initial={user} onSubmit={handleSubmit} submitLabel="Save profile" busy={busy}>
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
      </ProfileForm>
    </div>
  );
}
