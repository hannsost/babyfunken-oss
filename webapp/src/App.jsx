import { useCallback, useEffect, useRef, useState } from 'react';
import * as P from '@babyfunken/shared/protocol';
import { DEFAULT_SETTINGS, QUALITY_PRESETS } from '@babyfunken/shared/constants';
import useSignaling from './hooks/useSignaling.js';
import useWebRTC from './hooks/useWebRTC.js';
import SetupScreen from './components/SetupScreen.jsx';
import ServerView from './components/ServerView.jsx';
import ClientView from './components/ClientView.jsx';
import ControlPanel from './components/ControlPanel.jsx';

// Served from the signaling server in production; in `npm run dev` the
// Vite port differs, so fall back to the local server.
const SIGNALING_URL = import.meta.env.VITE_SERVER_URL
  ?? (window.location.port === '8003' ? 'http://localhost:8002' : window.location.origin);

export default function App() {
  const signaling = useSignaling(SIGNALING_URL);
  const [role, setRole] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [alert, setAlert] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const alertTimer = useRef(null);

  const { remoteStreams, startPTT, stopPTT, closeAll } =
    useWebRTC({ signaling, localStream, role, iceServers: signaling.iceServers });

  const isCamera = role === P.ROLE_SERVER;

  useEffect(() => {
    let cancelled = false;
    let stream = null;

    if (isCamera) {
      const preset = QUALITY_PRESETS.balanced;
      navigator.mediaDevices
        .getUserMedia({
          video: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        })
        .then(result => {
          stream = result;
          if (cancelled) { result.getTracks().forEach(t => t.stop()); return; }
          setLocalStream(result);
        })
        .catch(error => console.error('[media] camera unavailable:', error));
    }

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    };
  }, [isCamera]);

  const triggerAlert = useCallback((incoming) => {
    setAlert(incoming);
    if (alertTimer.current) clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), 8000);
    navigator.vibrate?.([400, 120, 400]);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(incoming.type === 'cry' ? 'Schrei erkannt' : 'Bewegung erkannt', {
        body: incoming.from ? `Kamera: ${incoming.from}` : 'Babyfunken',
        tag: 'babyfunken-alert',
      });
    }
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const offCry = signaling.on(P.ALERT_CRY, ({ fromDeviceName }) =>
      triggerAlert({ type: 'cry', from: fromDeviceName }));
    const offMotion = signaling.on(P.ALERT_MOTION, ({ fromDeviceName }) =>
      triggerAlert({ type: 'motion', from: fromDeviceName }));
    const offPlay = signaling.on(P.LULLABY_PLAY, ({ id }) => setNowPlaying(id));
    const offStop = signaling.on(P.LULLABY_STOP, () => setNowPlaying(null));
    return () => { offCry(); offMotion(); offPlay(); offStop(); };
  }, [signaling, triggerAlert]);

  function leave() {
    closeAll();
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    signaling.leaveGroup();
    setRole(null);
    setAlert(null);
  }

  function changeRole(next) {
    closeAll();
    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    signaling.setRole(next);
    setRole(next);
  }

  if (!signaling.groupId || !role) {
    return <SetupScreen signaling={signaling} onReady={setRole} />;
  }

  const myDevice = signaling.devices.find(d => d.deviceId === signaling.myDeviceId);

  return (
    <div style={s.page}>
      {alert && (
        <div style={s.alert} role="alert">
          <div style={{ flex: 1 }}>
            <div style={s.alertTitle}>
              {alert.type === 'cry' ? 'Schrei erkannt' : 'Bewegung erkannt'}
            </div>
            {alert.from && <div style={s.alertFrom}>Kamera: {alert.from}</div>}
          </div>
          <button type="button" style={s.alertClose} onClick={() => setAlert(null)}>✕</button>
        </div>
      )}

      {!signaling.connected && (
        <div style={s.notice}>Verbindung unterbrochen — Babyfunken verbindet sich neu.</div>
      )}

      <header style={s.header}>
        <div>
          <div style={s.groupLabel}>{isCamera ? 'KAMERA' : 'MONITOR'}</div>
          <div style={s.groupCode}>{signaling.groupId}</div>
        </div>
        <button type="button" style={s.leave} onClick={leave}>Beenden</button>
      </header>

      <main style={s.main}>
        {isCamera ? (
          <ServerView
            localStream={localStream}
            signaling={signaling}
            settings={myDevice?.settings ?? DEFAULT_SETTINGS}
            nowPlaying={nowPlaying}
          />
        ) : (
          <ClientView
            remoteStreams={remoteStreams}
            onPTTStart={startPTT}
            onPTTStop={stopPTT}
          />
        )}
      </main>

      <ControlPanel
        signaling={signaling}
        role={role}
        onRoleChange={changeRole}
        nowPlaying={nowPlaying}
      />
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh', background: '#0a0a0a', color: '#f5f5f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: 16, maxWidth: 820, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  groupLabel: { fontSize: 11, letterSpacing: 1, color: '#585858', fontWeight: 600 },
  groupCode: { fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 700, letterSpacing: 4 },
  leave: {
    padding: '8px 14px', borderRadius: 6, border: '1px solid #3a3a3a',
    background: 'transparent', color: '#8a8a8a', cursor: 'pointer', fontSize: 13,
  },
  main: { flex: 1 },
  alert: {
    display: 'flex', alignItems: 'center', gap: 12, background: '#3a1111',
    border: '1px solid #ef4444', borderRadius: 12, padding: 14,
  },
  alertTitle: { color: '#fca5a5', fontWeight: 700, fontSize: 15 },
  alertFrom: { color: '#f87171', fontSize: 13, marginTop: 2 },
  alertClose: { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 },
  notice: {
    background: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: 12,
    padding: 12, fontSize: 14, color: '#8a8a8a',
  },
};
