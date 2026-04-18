export default function PhotoLog() {
  return (
    <div className="page" style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1>Photo logging</h1>
      <p className="muted">Snap a meal, get an AI-estimated nutritional breakdown.</p>
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📸</div>
        <h2 style={{ marginTop: 0 }}>Coming soon</h2>
        <p className="muted">
          We&apos;ll wire this up to a vision model in the next iteration. For now, use the
          <strong> Log food</strong> page with text or voice input.
        </p>
      </div>
    </div>
  );
}
