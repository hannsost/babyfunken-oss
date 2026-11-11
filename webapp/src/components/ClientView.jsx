import { useEffect, useRef, useState } from 'react';

/** The monitor side: the remote stream plus push-to-talk. */
export default function ClientView({ remoteStreams, onPTTStart, onPTTStop }) {
  const videoRef = useRef(null);
  const [talking, setTalking] = useState(false);

  const stream = [...remoteStreams.values()][0] ?? null;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Releasing the mouse outside the button must still stop transmission,
  // or a parent leaves their microphone open without realising.
  useEffect(() => {
    if (!talking) return undefined;
    const release = () => { setTalking(false); onPTTStop(); };
    window.addEventListener('mouseup', release);
    window.addEventListener('touchend', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('blur', release);
    };
  }, [talking, onPTTStop]);

  return (
    <div style={s.wrap}>
      <div style={s.stage}>
        {stream ? (
          <>
            <video ref={videoRef} autoPlay playsInline style={s.video} />
            <span style={s.live}>LIVE</span>
          </>
        ) : (
          <div style={s.empty}>Warte auf die Kamera…</div>
        )}
      </div>

      <button
        type="button"
        style={{ ...s.talk, ...(talking ? s.talkActive : {}) }}
        onMouseDown={() => { setTalking(true); onPTTStart(); }}
        onTouchStart={(e) => { e.preventDefault(); setTalking(true); onPTTStart(); }}
      >
        {talking ? 'Du sprichst…' : 'Zum Sprechen halten'}
      </button>
    </div>
  );
}

const s = {
  wrap: { display: 'grid', gap: 12 },
  stage: {
    position: 'relative', aspectRatio: '16 / 9', background: '#000',
    borderRadius: 12, overflow: 'hidden', border: '1px solid #2a2a2a',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  empty: { display: 'grid', placeItems: 'center', height: '100%', color: '#585858', fontSize: 15 },
  live: {
    position: 'absolute', top: 12, left: 12, background: 'rgba(239,68,68,0.85)',
    color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 1,
    padding: '3px 8px', borderRadius: 6,
  },
  talk: {
    padding: 18, borderRadius: 12, border: '1px solid #2a2a2a', background: '#141414',
    color: '#8a8a8a', fontSize: 15, fontWeight: 600, cursor: 'pointer', userSelect: 'none',
  },
  talkActive: { borderColor: '#ef4444', background: '#3a1111', color: '#fca5a5' },
};
