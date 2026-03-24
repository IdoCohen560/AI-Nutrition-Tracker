import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const MEALS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export default function LogFood() {
  const nav = useNavigate();
  const [mealType, setMealType] = useState('lunch');
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [parseConfidence, setParseConfidence] = useState(null);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [nutritionWarnings, setNutritionWarnings] = useState([]);
  const [nlpError, setNlpError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
        }),
      });
      nav('/dashboard');
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
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={parseMeal}>
            {busy ? 'Working…' : 'Parse & preview'}
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
