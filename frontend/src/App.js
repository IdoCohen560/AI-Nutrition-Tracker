import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Login from './pages/Login';
import LogFood from './pages/LogFood';
import Onboarding from './pages/Onboarding';
import PhotoLog from './pages/PhotoLog';
import Register from './pages/Register';
import Settings from './pages/Settings';
import './App.css';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireOnboarded({ children }) {
  const { user } = useAuth();
  if (!user?.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page muted">Loading…</div>;
  if (user?.onboarding_completed) return <Navigate to="/dashboard" replace />;
  if (user && !user.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <RequireOnboarded>
              <AppLayout />
            </RequireOnboarded>
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/log" element={<LogFood />} />
        <Route path="/photo" element={<PhotoLog />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
