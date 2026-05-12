import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export default function UnitToggle() {
  const { user, setUser } = useAuth();
  const useMetric = !!user?.use_metric;
  const [busy, setBusy] = useState(false);

  async function setUnit(toMetric) {
    if (busy || toMetric === useMetric) return;
    setBusy(true);
    try {
      const updated = await api('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ use_metric: toMetric }),
      });
      setUser?.(updated);
    } catch {
      /* swallow — toggle stays visually unchanged */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="range-toggle small unit-toggle" role="group" aria-label="Units">
      <button
        type="button"
        className={!useMetric ? 'active' : ''}
        onClick={() => setUnit(false)}
        disabled={busy}
      >
        lb / ft
      </button>
      <button
        type="button"
        className={useMetric ? 'active' : ''}
        onClick={() => setUnit(true)}
        disabled={busy}
      >
        kg / cm
      </button>
    </div>
  );
}
