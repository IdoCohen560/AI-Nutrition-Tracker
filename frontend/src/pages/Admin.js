import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      setUsers(await api('/admin/users'));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) load();
  }, [user, load]);

  if (!user) return <p className="muted">Loading…</p>;
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  async function setRole(target, role) {
    setBusyId(target.id);
    setErr('');
    try {
      await api(`/admin/users/${target.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <h1>Admin</h1>
      <div className="card-header">
        <p className="muted" style={{ margin: 0 }}>
          {loading ? 'Loading…' : `${users.length} registered user${users.length === 1 ? '' : 's'}`}
        </p>
        <button type="button" className="btn ghost small" onClick={load} disabled={loading}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>
      {err && <div className="error-banner">{err}</div>}
      <div className="card">
        {!loading && users.length === 0 && <p className="muted">No users yet.</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Signed up</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === user.id;
              const isSuper = u.role === 'super_admin';
              const locked = isSuper || isMe;
              return (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-tag role-${u.role}`}>{u.role}</span>
                  </td>
                  <td className="muted small">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {locked ? (
                      <span className="muted small">{isSuper ? 'super admin' : 'this is you'}</span>
                    ) : u.role === 'admin' ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={busyId === u.id}
                        onClick={() => setRole(u, 'user')}
                      >
                        {busyId === u.id ? '…' : 'Demote to user'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={busyId === u.id}
                        onClick={() => setRole(u, 'admin')}
                      >
                        {busyId === u.id ? '…' : 'Promote to admin'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
