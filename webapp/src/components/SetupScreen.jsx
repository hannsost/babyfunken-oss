import { useState } from 'react';
import { ROLE_CLIENT, ROLE_SERVER } from '@babyfunken/shared/protocol';
import { normaliseGroupCode, isValidGroupCode } from '@babyfunken/shared/constants';

/**
 * Entry screen. A pairing link opened in the browser carries ?g= and &s=,
 * so following an invitation is a single click; creating a group here is
 * for using a laptop webcam as the camera.
 */
function readInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const groupId = normaliseGroupCode(params.get('g') ?? '');
  const secret = params.get('s') ?? '';
  if (!isValidGroupCode(groupId) || !secret) return null;
  return { groupId, secret };
}

export default function SetupScreen({ signaling, onReady }) {
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('babyfunken.name') ?? '');
  const [role, setRole] = useState(ROLE_CLIENT);
  const [invite] = useState(readInviteFromUrl);
  const [submitted, setSubmitted] = useState(false);

  const saved = signaling.savedSession;
  const nameValid = displayName.trim().length >= 2;

  // Busy lasts from sending a request until the server either confirms a
  // group or says why it could not. Both are already state, so this is
  // derived rather than tracked separately.
  const busy = submitted && !signaling.error && !signaling.groupId;

  function remember() {
    localStorage.setItem('babyfunken.name', displayName.trim());
  }

  function create() {
    remember();
    setSubmitted(true);
    // App only swaps screens once a group actually exists, so handing the
    // role up now is safe even if the request fails.
    onReady(role);
    signaling.createGroup(displayName.trim(), role);
  }

  function join(credentials) {
    remember();
    setSubmitted(true);
    onReady(role);
    signaling.joinGroup({ ...credentials, displayName: displayName.trim(), role });
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Babyfunken</h1>
        <div style={s.status}>
          <span style={{ ...s.dot, background: signaling.connected ? '#34d399' : '#fbbf24' }} />
          {signaling.connected ? 'Verbunden' : signaling.connecting ? 'Verbinde…' : 'Keine Verbindung'}
        </div>

        {signaling.error && <div style={s.error}>{signaling.error}</div>}

        <label style={s.label} htmlFor="device-name">Name dieses Geräts</label>
        <input
          id="device-name"
          style={s.input}
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="z. B. Laptop Küche"
          maxLength={40}
        />

        <div style={s.roleRow}>
          {[
            { value: ROLE_SERVER, label: 'Kamera', detail: 'Beim Baby' },
            { value: ROLE_CLIENT, label: 'Monitor', detail: 'Bei dir' },
          ].map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRole(option.value)}
              style={{ ...s.roleBtn, ...(role === option.value ? s.roleBtnActive : {}) }}
            >
              <span style={{ fontWeight: 600 }}>{option.label}</span>
              <span style={s.roleDetail}>{option.detail}</span>
            </button>
          ))}
        </div>

        {invite && (
          <button
            type="button"
            style={s.primary}
            disabled={!nameValid || busy || !signaling.connected}
            onClick={() => join(invite)}
          >
            Gruppe {invite.groupId} beitreten
          </button>
        )}

        {saved?.groupId && !invite && (
          <button
            type="button"
            style={s.primary}
            disabled={busy || !signaling.connected}
            onClick={() => join({ groupId: saved.groupId, secret: saved.secret, deviceToken: saved.deviceToken })}
          >
            Wieder verbinden ({saved.groupId})
          </button>
        )}

        <button
          type="button"
          style={invite || saved?.groupId ? s.secondary : s.primary}
          disabled={!nameValid || busy || !signaling.connected}
          onClick={create}
        >
          Neue Gruppe erstellen
        </button>

        {!invite && !saved?.groupId && (
          <p style={s.hint}>
            Zum Beitreten öffne den Einladungslink vom Kamera-Gerät. Ein Beitritt ohne
            Link ist nicht möglich — der Gruppencode allein reicht bewusst nicht aus.
          </p>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: '100vh', display: 'grid', placeItems: 'center',
    background: '#0a0a0a', color: '#f5f5f5', padding: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%', maxWidth: 420, background: '#141414',
    border: '1px solid #2a2a2a', borderRadius: 16, padding: 24,
  },
  title: { margin: '0 0 4px', fontSize: 30, letterSpacing: -0.5 },
  status: { display: 'flex', alignItems: 'center', gap: 8, color: '#8a8a8a', fontSize: 13, marginBottom: 20 },
  dot: { width: 9, height: 9, borderRadius: 999, display: 'inline-block' },
  error: {
    background: '#3a1111', border: '1px solid #ef4444', color: '#fca5a5',
    borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16,
  },
  label: { display: 'block', fontSize: 12, color: '#8a8a8a', marginBottom: 6, fontWeight: 600, letterSpacing: 0.6 },
  input: {
    width: '100%', boxSizing: 'border-box', padding: 13, borderRadius: 8,
    border: '1px solid #2a2a2a', background: '#0a0a0a', color: '#f5f5f5', fontSize: 15,
  },
  roleRow: { display: 'flex', gap: 8, margin: '16px 0 20px' },
  roleBtn: {
    flex: 1, padding: 12, borderRadius: 8, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#8a8a8a', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14,
  },
  roleBtnActive: { borderColor: '#2563eb', background: '#16233f', color: '#5b9aff' },
  roleDetail: { fontSize: 12, color: '#585858' },
  primary: {
    width: '100%', padding: 14, borderRadius: 8, border: 'none',
    background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', marginBottom: 8,
  },
  secondary: {
    width: '100%', padding: 14, borderRadius: 8, border: '1px solid #3a3a3a',
    background: 'transparent', color: '#aaa', fontSize: 15, cursor: 'pointer', marginBottom: 8,
  },
  hint: { fontSize: 13, color: '#585858', lineHeight: 1.5, marginTop: 12, marginBottom: 0 },
};
