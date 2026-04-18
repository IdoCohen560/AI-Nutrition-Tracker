import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const REGION_ID = 'bc-scan-region';

// Barcodes we care about for food — not all QR types. Narrower = faster + fewer false positives.
const FORMATS = [
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
];

function friendlyError(err) {
  const msg = (err && (err.message || err.name || String(err))) || '';
  if (/NotAllowed/i.test(msg)) return { title: 'Camera permission denied', body: 'Allow camera access for this site, then tap Retry.' };
  if (/NotReadable|TrackStart/i.test(msg)) return { title: 'Camera is busy', body: 'Close other apps/tabs using the camera (Zoom, FaceTime, another browser tab), then tap Retry.' };
  if (/NotFound|OverconstrainedError/i.test(msg)) return { title: 'No suitable camera', body: 'Your device has no back camera, or the camera is disabled. Enter the barcode manually below.' };
  if (/secure|https/i.test(msg)) return { title: 'HTTPS required', body: 'Camera only works on https:// pages. Use the deployed site.' };
  return { title: 'Camera error', body: msg || 'Something went wrong. Enter the barcode manually below.' };
}

export default function BarcodeScanner({ onDetected, onClose }) {
  const [status, setStatus] = useState({ kind: 'starting', text: 'Requesting camera…' });
  const [manual, setManual] = useState('');
  const scannerRef = useRef(null);
  const stoppedRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);

  // Lock body scroll while the modal is open (feels more native on phones).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;

    const scanner = new Html5Qrcode(REGION_ID, {
      formatsToSupport: FORMATS,
      verbose: false,
    });
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      // qrbox adapts to the shorter dimension — works on phones in portrait and desktops.
      qrbox: (viewW, viewH) => {
        const edge = Math.min(viewW, viewH);
        const w = Math.round(edge * 0.75);
        const h = Math.round(edge * 0.45);
        return { width: w, height: h };
      },
      aspectRatio: undefined, // let the browser pick so we don't force a black-bar layout
      disableFlip: false,
    };

    const onScan = (decoded) => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      scanner.stop().catch(() => {}).finally(() => onDetected?.(decoded));
    };

    (async () => {
      try {
        // Skip getCameras() — asking for facingMode: environment is faster and works
        // on desktops too (they just get the default device).
        await scanner.start({ facingMode: { ideal: 'environment' } }, config, onScan, () => { /* per-frame noise */ });
        if (!cancelled) setStatus({ kind: 'scanning', text: 'Point at a barcode' });
      } catch (err) {
        // Fallback: try without the facingMode constraint (desktops, strict browsers)
        try {
          await scanner.start({ facingMode: 'user' }, config, onScan, () => {});
          if (!cancelled) setStatus({ kind: 'scanning', text: 'Using front camera — point at a barcode' });
        } catch (err2) {
          const friendly = friendlyError(err2 || err);
          if (!cancelled) setStatus({ kind: 'error', ...friendly });
        }
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s && s.isScanning) {
        s.stop().catch(() => {}).finally(() => { try { s.clear(); } catch { /* noop */ } });
      }
    };
  }, [onDetected, retryToken]);

  function submitManual(e) {
    e.preventDefault();
    const code = manual.replace(/\D/g, '');
    if (code.length < 6) { setStatus({ kind: 'error', title: 'Barcode too short', body: 'UPC/EAN codes are 8–13 digits.' }); return; }
    onDetected?.(code);
  }

  function retry() {
    setStatus({ kind: 'starting', text: 'Restarting camera…' });
    setRetryToken((n) => n + 1);
  }

  return (
    <div className="bc-backdrop" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <div className="bc-panel">
        <header className="bc-header">
          <h2>Scan barcode</h2>
          <button type="button" className="bc-close" onClick={onClose} aria-label="Close scanner">✕</button>
        </header>

        <div className="bc-stage">
          <div id={REGION_ID} className="bc-region" />
          {status.kind !== 'scanning' && (
            <div className="bc-overlay">
              {status.kind === 'error' ? (
                <>
                  <p className="bc-overlay-title">{status.title}</p>
                  <p className="bc-overlay-body">{status.body}</p>
                  <button type="button" className="btn primary small" onClick={retry}>Retry camera</button>
                </>
              ) : (
                <p className="bc-overlay-title">{status.text}</p>
              )}
            </div>
          )}
          {status.kind === 'scanning' && (
            <div className="bc-hint">{status.text}</div>
          )}
        </div>

        <form onSubmit={submitManual} className="bc-manual">
          <label className="muted small">Can't scan? Enter barcode manually</label>
          <div className="bc-manual-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="UPC / EAN (8–13 digits)"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button type="submit" className="btn primary">Look up</button>
          </div>
        </form>
      </div>
    </div>
  );
}
