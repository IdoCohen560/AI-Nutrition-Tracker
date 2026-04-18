import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export default function LogFood() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const today = useMemo(localToday, []);
  const minDate = useMemo(firstOfMonth, []);
  const initialDate = (() => {
    const q = params.get('date');
    if (q && q >= minDate && q <= today) return q;
    return today;
  })();
  const initialMeal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(params.get('meal'))
    ? params.get('meal')
    : 'lunch';
  const [forDate, setForDate] = useState(initialDate);
  const [mealType, setMealType] = useState(initialMeal);
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [parseConfidence, setParseConfidence] = useState(null);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [nutritionWarnings, setNutritionWarnings] = useState([]);
  const [nlpError, setNlpError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [recent, setRecent] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  useEffect(() => {
    api('/stats?tz=' + new Date().getTimezoneOffset()).then((s) => setRecent(s.recent_foods || [])).catch(() => {});
    api('/favorites').then(setFavorites).catch(() => {});
  }, []);

  function appendToText(s) {
    setText((cur) => (cur ? `${cur}, ${s}` : s));
  }

  async function toggleFavorite(name) {
    const exists = favorites.some((f) => f.toLowerCase() === name.toLowerCase());
    const next = exists ? favorites.filter((f) => f.toLowerCase() !== name.toLowerCase()) : [...favorites, name];
    setFavorites(next);
    try { await api('/favorites', { method: 'PUT', body: JSON.stringify({ foods: next }) }); } catch { /* ignore */ }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setErr('Voice not supported in this browser. Use Chrome or Edge.'); return; }
    if (listening) { recogRef.current?.stop(); return; }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = (ev) => {
      const t = Array.from(ev.results).map((res) => res[0].transcript).join(' ');
      setText((cur) => (cur ? `${cur} ${t}` : t));
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => { setErr(`Voice error: ${e.error || 'unknown'}`); setListening(false); };
    recogRef.current = r;
    setListening(true);
    setErr('');
    r.start();
  }

  async function parseMeal() {
    setErr('');
    setNlpError(null);
    setBusy(true);
    try {
      const res = await api('/logs/parse', {
        method: 'POST',
        body: JSON.stringify({ text, meal_type: mealType }),
      });
      if (res.nlp_error) {
        setNlpError(res.nlp_error);
        setItems([]);
        setParseConfidence(null);
        setRequiresConfirmation(false);
        setNutritionWarnings([]);
        return;
      }
      setItems(res.items || []);
      setParseConfidence(res.parse_confidence);
      setRequiresConfirmation(res.requires_confirmation);
      setNutritionWarnings(res.nutrition_warnings || []);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  function updateItem(idx, field, value) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  async function saveEntry() {
    setErr('');
    if (!items.length) {
      setErr('Parse a meal first or add items manually after parse.');
      return;
    }
    setBusy(true);
    try {
      await api('/logs', {
        method: 'POST',
        body: JSON.stringify({
          meal_type: mealType,
          description_text: text,
          items,
          parse_confidence: parseConfidence,
          confirmed: true,
          for_date: forDate,
          tz_offset: new Date().getTimezoneOffset(),
        }),
      });
      nav(forDate === today ? '/dashboard' : `/history?date=${forDate}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Log food</h1>
      <p className="muted">Describe what you ate in plain English. We&apos;ll parse it and look up nutrition.</p>

      <div className="card">
        <label>
          Date
          <input
            type="date"
            value={forDate}
            min={minDate}
            max={today}
            onChange={(e) => setForDate(e.target.value)}
          />
          <span className="muted small">You can edit any day this month, up to today.</span>
        </label>
        <label>
          Meal type
          <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
            {MEALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          What did you eat?
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 2 eggs, toast with butter, and black coffee"
          />
        </label>
        {favorites.length > 0 && (
          <div className="quick-row">
            <span className="muted small">Favorites:</span>
            {favorites.map((f) => (
              <button key={f} type="button" className="chip" onClick={() => appendToText(f)}>{f}</button>
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="quick-row">
            <span className="muted small">Recent:</span>
            {recent.map((f) => {
              const fav = favorites.some((x) => x.toLowerCase() === f.toLowerCase());
              return (
                <span key={f} className="chip-recent">
                  <button type="button" className="chip" onClick={() => appendToText(f)}>{f}</button>
                  <button type="button" className="star" title={fav ? 'Unfavorite' : 'Add to favorites'} onClick={() => toggleFavorite(f)}>
                    {fav ? '★' : '☆'}
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={parseMeal}>
            {busy ? 'Working…' : 'Parse & preview'}
          </button>
          <button type="button" className={`btn ghost ${listening ? 'active' : ''}`} onClick={startVoice}>
            {listening ? '⏺ Listening…' : '🎤 Voice'}
          </button>
        </div>
        {nlpError && <div className="error-banner">{nlpError}</div>}
        {err && <div className="error-banner">{err}</div>}
      </div>

      {nutritionWarnings.length > 0 && (
        <div className="notice">
          Estimated nutrition for: {nutritionWarnings.join(', ')} — you can edit values below or pick
          manually next time.
        </div>
      )}

      {items.length > 0 && (
        <div className="card">
          <h2>Review items</h2>
          {requiresConfirmation && (
            <p className="notice">
              Parse confidence is below 80% — please confirm or edit items before saving.
            </p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>kcal</th>
                <th>P</th>
                <th>C</th>
                <th>F</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="table-input"
                      value={it.name}
                      onChange={(e) => updateItem(i, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input narrow"
                      value={it.calories}
                      onChange={(e) => updateItem(i, 'calories', Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      className="table-input narrow"
                      value={it.protein_g}
                      onChange={(e) => updateItem(i, 'protein_g', Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      className="table-input narrow"
                      value={it.carbs_g}
                      onChange={(e) => updateItem(i, 'carbs_g', Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      className="table-input narrow"
                      value={it.fat_g}
                      onChange={(e) => updateItem(i, 'fat_g', Number(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row">
            <button type="button" className="btn primary" disabled={busy} onClick={saveEntry}>
              Save log entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
