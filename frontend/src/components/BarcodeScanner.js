import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const REGION_ID = 'bc-scan-region';

export default function BarcodeScanner({ onDetected, onClose }) {
  const [status, setStatus] = useState('Requesting camera…');
  const [manual, setManual] = useState('');
  const scannerRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const scanner = new Html5Qrcode(REGION_ID, /* verbose */ false);
    scannerRef.current = scanner;

    (async () => {
      try {
        const cams = await Html5Qrcode.getCameras();
        if (!active) return;
        if (!cams?.length) {
          setStatus('No camera found. Enter the barcode manually.');
          return;
        }
        // Prefer the back camera on phones
        const pick = cams.find((c) => /back|rear|environment/i.test(c.label)) || cams[cams.length - 1];
        await scanner.start(
          pick.id,
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded) => {
            if (stoppedRef.current) return;
            stoppedRef.current = true;
            scanner.stop().catch(() => {}).finally(() => onDetected?.(decoded));
          },
          () => { /* per-frame misses — ignore */ },
        );
        if (active) setStatus('Point at a barcode');
      } catch (err) {
        setStatus(`Camera error: ${err?.message || err}. Enter manually.`);
      }
    })();

    return () => {
      active = false;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* noop */ } });
      }
    };
  }, [onDetected]);

  function submitManual(e) {
    e.preventDefault();
    const code = manual.replace(/\D/g, '');
    if (code.length < 6) { setStatus('Barcode must be at least 6 digits.'); return; }
    onDetected?.(code);
  }

  return (
    <div className="bc-backdrop" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <div className="bc-panel card">
        <div className="card-header">
          <h2>Scan barcode</h2>
          <button type="button" className="btn linkish" onClick={onClose}>✕ Close</button>
        </div>
        <div id={REGION_ID} className="bc-region" />
        <p className="muted small" style={{ marginTop: '0.5rem' }}>{status}</p>
        <form onSubmit={submitManual} className="btn-row" style={{ marginTop: '0.5rem' }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="or enter UPC / GTIN"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            style={{ flex: '2 1 200px' }}
          />
          <button type="submit" className="btn primary small">Look up</button>
        </form>
      </div>
    </div>
  );
}
