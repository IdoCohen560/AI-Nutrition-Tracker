import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AppLayout() {
  const { logout, user } = useAuth();
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  const nav = useNavigate();

  async function handleLogout() {
    await logout();
    nav('/login', { replace: true });
  }

  return (
    <div className="shell">
      <header className="top-nav">
        <NavLink to="/dashboard" className="brand">
          <img src="/logo192.png" alt="NutriBoo AI" className="brand-logo" />
          <span>NutriBoo AI</span>
        </NavLink>
        <nav className="nav-links">
          <NavLink to="/dashboard" end>
            Dashboard
          </NavLink>
          <NavLink to="/log">Log food</NavLink>
          <NavLink to="/photo">📸 Photo</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          <button type="button" className="btn linkish" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
