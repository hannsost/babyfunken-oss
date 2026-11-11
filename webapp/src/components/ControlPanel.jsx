import { useState } from 'react';
import * as P from '@babyfunken/shared/protocol';
import { LULLABIES } from '@babyfunken/shared/constants';

/** Group roster, lullaby remote, pairing link and role switch. */
export default function ControlPanel({ signaling, role, onRoleChange, nowPlaying }) {
  const [copied, setCopied] = useState(false);

  const others = signaling.devices.filter(d => d.deviceId !== signaling.myDeviceId);
  const inviteUrl = signaling.secret
    ? `${window.location.origin}/?g=${signaling.groupId}&s=${encodeURIComponent(signaling.secret)}`
    : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Einladungslink kopieren:', inviteUrl);
    }
  }

  return (
    <div style={s.panel}>
      <section style={s.section}>
        <h2 style={s.heading}>Einschlafhilfe</h2>
        <div style={s.chips}>
          {LULLABIES.map(item => {
            const active = nowPlaying === item.id;
            return (
              <button
                key={item.id}
                type="button"
                style={{ ...s.chip, ...(active ? s.chipActive : {}) }}
                onClick={() => signaling.emit(active ? P.LULLABY_STOP : P.LULLABY_PLAY, { id: item.id })}
              >
                {item.title}
              </button>
            );
          })}
        </div>
        <p style={s.note}>Die Musik läuft auf dem Kamera-Gerät, nicht hier.</p>
      </section>

      <section style={s.section}>
        <h2 style={s.heading}>Geräte ({others.length + 1})</h2>
        <ul style={s.list}>
          <li style={s.item}>
            <span style={{ ...s.dot, background: role === P.ROLE_SERVER ? '#34d399' : '#5b9aff' }} />
            <span style={s.name}>Dieses Gerät</span>
            <span style={s.roleTag}>{role === P.ROLE_SERVER ? 'Kamera' : 'Monitor'}</span>
          </li>
          {others.map(device => (
            <li key={device.deviceId} style={s.item}>
              <span style={{ ...s.dot, background: device.role === P.ROLE_SERVER ? '#34d399' : '#5b9aff' }} />
              <span style={s.name}>{device.displayName}</span>
              <span style={s.roleTag}>{device.role === P.ROLE_SERVER ? 'Kamera' : 'Monitor'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={s.section}>
        <h2 style={s.heading}>Gerät hinzufügen</h2>
        {!inviteUrl ? (
          <p style={s.note}>
            Dieses Gerät kennt den Kopplungsschlüssel nicht. Lade neue Geräte von dem
            Gerät aus ein, das die Gruppe erstellt hat.
          </p>
        ) : signaling.pairing.open ? (
          <>
            <button type="button" style={s.button} onClick={copyInvite}>
              {copied ? 'Kopiert' : 'Einladungslink kopieren'}
            </button>
            <button type="button" style={s.buttonQuiet} onClick={signaling.closePairing}>
              Kopplung schließen
            </button>
            <p style={s.note}>
              Wer diesen Link hat, kann das Kamerabild sehen. Schließe die Kopplung,
              sobald das neue Gerät verbunden ist.
            </p>
          </>
        ) : (
          <>
            <p style={s.note}>Die Kopplung ist geschlossen — niemand kann gerade beitreten.</p>
            <button type="button" style={s.button} onClick={signaling.openPairing}>
              Kopplung öffnen
            </button>
          </>
        )}
      </section>

      <button
        type="button"
        style={s.buttonQuiet}
        onClick={() => onRoleChange(role === P.ROLE_SERVER ? P.ROLE_CLIENT : P.ROLE_SERVER)}
      >
        Wechseln zu {role === P.ROLE_SERVER ? 'Monitor' : 'Kamera'}
      </button>
    </div>
  );
}

const s = {
  panel: { display: 'grid', gap: 12 },
  section: { background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16 },
  heading: { margin: '0 0 12px', fontSize: 11, letterSpacing: 1, color: '#585858', textTransform: 'uppercase' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: {
    padding: '9px 14px', borderRadius: 999, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#8a8a8a', cursor: 'pointer', fontSize: 13,
  },
  chipActive: { borderColor: '#2563eb', background: '#16233f', color: '#5b9aff' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 },
  item: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0 },
  name: { flex: 1, fontSize: 14, color: '#f5f5f5' },
  roleTag: { fontSize: 12, color: '#585858' },
  button: {
    width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#2563eb',
    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
  },
  buttonQuiet: {
    width: '100%', padding: 12, borderRadius: 8, border: '1px solid #3a3a3a',
    background: 'transparent', color: '#aaa', fontSize: 14, cursor: 'pointer',
  },
  note: { fontSize: 13, color: '#585858', lineHeight: 1.5, margin: '10px 0 0' },
};
