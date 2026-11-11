import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, Vibration, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RTCView, mediaDevices } from 'react-native-webrtc';
import { useKeepAwake } from 'expo-keep-awake';
import * as P from '@babyfunken/shared/protocol';
import { QUALITY_PRESETS, DEFAULT_SETTINGS } from '@babyfunken/shared/constants';

import useWebRTC from '../hooks/useWebRTC';
import { CryDetector } from '../lib/cryDetector';
import * as lullabies from '../lib/lullabies';
import { notifyAlert, configureNotifications } from '../lib/notifications';
import { loadPreferences, savePreferences } from '../lib/storage';
import ForegroundService from '../../modules/foreground-service';
import PairingCode from '../components/PairingCode';
import { Banner, Button, Card, StatusDot } from '../components/ui';
import { colors, radius, spacing, type } from '../theme';

const ALERT_VISIBLE_MS = 8000;

export default function ActiveScreen({ signaling, role, onRoleChange, onLeave }) {
  useKeepAwake();

  const isCamera = role === P.ROLE_SERVER;

  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [talking, setTalking] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showPairing, setShowPairing] = useState(false);
  const [facing, setFacing] = useState('environment');
  const [now, setNow] = useState(0);

  const alertTimer = useRef(null);
  const detectorRef = useRef(null);
  const appState = useRef(AppState.currentState);

  const { remoteStreams, peerStates, startPTT, stopPTT, closeAll, getPeerConnections } =
    useWebRTC({ signaling, localStream, role, iceServers: signaling.iceServers });

  // ── Settings ────────────────────────────────────────────────
  useEffect(() => {
    loadPreferences().then(prefs => {
      if (prefs.settings) setSettings(s => ({ ...s, ...prefs.settings }));
    });
    configureNotifications();
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      savePreferences({ settings: next });
      signaling.emit(P.SETTINGS_UPDATE, { settings: next });
      return next;
    });
  }, [signaling]);

  // ── Camera capture ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let stream = null;

    async function capture() {
      if (!isCamera) return;

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        const ok = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted'
          && granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
        if (!ok) {
          setMediaError('Ohne Kamera- und Mikrofonfreigabe kann dieses Gerät nicht senden.');
          return;
        }
      }

      const preset = QUALITY_PRESETS[settings.quality] ?? QUALITY_PRESETS.balanced;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,   // a cry detector needs the raw level
            autoGainControl: false,
          },
          video: {
            facingMode: facing,
            width: preset.width,
            height: preset.height,
            frameRate: preset.frameRate,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);
        setMediaError(null);
      } catch (error) {
        setMediaError(`Kamera konnte nicht gestartet werden: ${error?.message ?? 'unbekannt'}`);
      }
    }

    capture();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    };
  }, [isCamera, facing, settings.quality]);

  // ── Foreground service ──────────────────────────────────────
  // Without this Android suspends the app minutes after the screen locks,
  // which is precisely when a baby monitor needs to still be running.
  useEffect(() => {
    const mode = isCamera ? ForegroundService.MODE_CAMERA : ForegroundService.MODE_MONITOR;
    const title = isCamera ? 'Kamera aktiv' : 'Monitor aktiv';
    const body = `Gruppe ${signaling.groupId ?? ''}`.trim();

    ForegroundService.start(mode, title, body).catch(() => {});
    return () => { ForegroundService.stop().catch(() => {}); };
  }, [isCamera, signaling.groupId]);

  useEffect(() => {
    const watchers = signaling.devices.length;
    const body = isCamera
      ? (watchers > 1 ? `${watchers - 1} Gerät(e) sehen mit` : 'Niemand verbunden')
      : (remoteStreams.size > 0 ? 'Stream läuft' : 'Warte auf Kamera');
    ForegroundService.update(isCamera ? 'Kamera aktiv' : 'Monitor aktiv', body).catch(() => {});
  }, [isCamera, signaling.devices.length, remoteStreams.size]);

  // The pairing countdown reads a clock that ticks in state. Reading
  // Date.now() during render would produce a different value every paint.
  useEffect(() => {
    if (!showPairing) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [showPairing]);

  // ── App state ───────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { appState.current = next; });
    return () => sub.remove();
  }, []);

  // ── Alerts ──────────────────────────────────────────────────
  const triggerAlert = useCallback(async (incoming) => {
    setAlert(incoming);
    if (alertTimer.current) clearTimeout(alertTimer.current);
    alertTimer.current = setTimeout(() => setAlert(null), ALERT_VISIBLE_MS);

    Vibration.vibrate([0, 400, 120, 400]);
    await notifyAlert(incoming);
  }, []);

  useEffect(() => {
    const offCry = signaling.on(P.ALERT_CRY, ({ fromDeviceName }) =>
      triggerAlert({ type: 'cry', from: fromDeviceName }));
    const offMotion = signaling.on(P.ALERT_MOTION, ({ fromDeviceName }) =>
      triggerAlert({ type: 'motion', from: fromDeviceName }));
    return () => { offCry(); offMotion(); };
  }, [signaling, triggerAlert]);

  // ── Cry detection (camera side only) ────────────────────────
  useEffect(() => {
    if (!isCamera || !settings.cryDetection || !localStream) return undefined;

    const detector = new CryDetector({
      getPeerConnections,
      sensitivity: settings.crySensitivity,
      onCry: () => signaling.emit(P.ALERT_CRY, {}),
    });
    detectorRef.current = detector;
    detector.start();

    return () => {
      detector.stop();
      detectorRef.current = null;
    };
  }, [isCamera, settings.cryDetection, settings.crySensitivity, localStream, getPeerConnections, signaling]);

  // ── Lullabies ───────────────────────────────────────────────
  useEffect(() => {
    const offPlay = signaling.on(P.LULLABY_PLAY, async ({ id }) => {
      setNowPlaying(id);
      // Only the device next to the baby actually makes sound.
      if (isCamera) await lullabies.play(id);
    });

    const offStop = signaling.on(P.LULLABY_STOP, () => {
      setNowPlaying(null);
      if (isCamera) lullabies.stop();
    });

    const offVolume = signaling.on(P.LULLABY_VOLUME, ({ volume }) => {
      if (isCamera) lullabies.setVolume(volume);
    });

    return () => { offPlay(); offStop(); offVolume(); };
  }, [signaling, isCamera]);

  useEffect(() => () => lullabies.stop(), []);

  // ── Actions ─────────────────────────────────────────────────
  const leave = useCallback(async () => {
    closeAll();
    lullabies.stop();
    localStream?.getTracks().forEach(t => t.stop());
    await ForegroundService.stop();
    await signaling.leaveGroup();
    onLeave();
  }, [closeAll, localStream, signaling, onLeave]);

  const switchRole = useCallback(() => {
    closeAll();
    const next = isCamera ? P.ROLE_CLIENT : P.ROLE_SERVER;
    signaling.setRole(next);
    onRoleChange(next);
  }, [closeAll, isCamera, signaling, onRoleChange]);

  const others = useMemo(
    () => signaling.devices.filter(d => d.deviceId !== signaling.myDeviceId),
    [signaling.devices, signaling.myDeviceId],
  );

  const pairingSecondsLeft = now > 0
    ? Math.max(0, Math.floor((signaling.pairing.pairingOpenUntil - now) / 1000))
    : 0;

  const remoteEntries = [...remoteStreams.entries()];
  const linkState = [...peerStates.values()].includes('connected')
    ? 'connected'
    : peerStates.size > 0 ? 'connecting' : 'idle';

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={s.header}>
        <View>
          <Text style={s.headerLabel}>{isCamera ? 'KAMERA' : 'MONITOR'}</Text>
          <Text style={s.headerCode}>{signaling.groupId}</Text>
        </View>
        <View style={s.headerRight}>
          <StatusDot state={signaling.connected ? linkState : 'failed'} />
          <TouchableOpacity onPress={leave} accessibilityRole="button" style={s.leaveButton}>
            <Text style={s.leaveText}>Beenden</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {alert ? (
          <Banner
            title={alert.type === 'cry' ? 'Schrei erkannt' : 'Bewegung erkannt'}
            detail={alert.from ? `Kamera: ${alert.from}` : null}
            onDismiss={() => setAlert(null)}
          />
        ) : null}

        {!signaling.connected ? (
          <Banner tone="neutral" title="Verbindung unterbrochen" detail="Babyfunken verbindet sich automatisch neu." />
        ) : null}

        {mediaError ? <Banner title={mediaError} /> : null}

        <View style={s.stage}>
          {isCamera && localStream ? (
            <>
              <RTCView streamURL={localStream.toURL()} style={s.video} objectFit="cover" mirror={facing === 'user'} />
              <View style={s.stageBadge}><Text style={s.stageBadgeText}>SENDET</Text></View>
            </>
          ) : !isCamera && remoteEntries.length > 0 ? (
            <>
              <RTCView streamURL={remoteEntries[0][1].toURL()} style={s.video} objectFit="cover" />
              <View style={[s.stageBadge, s.liveBadge]}><Text style={s.stageBadgeText}>LIVE</Text></View>
            </>
          ) : (
            <View style={s.stageEmpty}>
              <Text style={s.stageEmptyText}>
                {isCamera ? 'Kamera startet…' : 'Warte auf die Kamera…'}
              </Text>
            </View>
          )}
        </View>

        {!isCamera ? (
          <TouchableOpacity
            style={[s.talk, talking && s.talkActive]}
            onPressIn={() => { setTalking(true); startPTT(); }}
            onPressOut={() => { setTalking(false); stopPTT(); }}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Zum Sprechen gedrückt halten"
          >
            <Text style={[s.talkText, talking && s.talkTextActive]}>
              {talking ? 'Du sprichst…' : 'Zum Sprechen halten'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <Card title="EINSCHLAFHILFE">
          <View style={s.lullabyRow}>
            {lullabies.catalogue.map(item => {
              const active = nowPlaying === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => signaling.emit(active ? P.LULLABY_STOP : P.LULLABY_PLAY, { id: item.id })}
                  style={[s.lullaby, active && s.lullabyActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.lullabyText, active && s.lullabyTextActive]}>{item.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {nowPlaying ? (
            <Button
              title="Musik stoppen"
              variant="secondary"
              onPress={() => signaling.emit(P.LULLABY_STOP, {})}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>

        <Card title={`GERÄTE (${others.length + 1})`}>
          <DeviceRow name="Dieses Gerät" role={role} self />
          {others.map(device => (
            <DeviceRow key={device.deviceId} name={device.displayName} role={device.role} />
          ))}

          <Button
            title={showPairing ? 'Kopplung ausblenden' : 'Gerät hinzufügen'}
            variant="secondary"
            onPress={() => { setNow(Date.now()); setShowPairing(v => !v); }}
            style={{ marginTop: spacing.md }}
          />
          {showPairing ? (
            <View style={{ marginTop: spacing.lg }}>
              <PairingCode
                groupId={signaling.groupId}
                secret={signaling.secret}
                open={signaling.pairing.open}
                secondsLeft={pairingSecondsLeft}
                onOpen={signaling.openPairing}
                onClose={signaling.closePairing}
              />
            </View>
          ) : null}
        </Card>

        <Card title="EINSTELLUNGEN">
          <Toggle
            label="Schrei-Erkennung"
            detail="Alarmiert, wenn anhaltend lautes Weinen erkannt wird."
            value={settings.cryDetection}
            onChange={value => updateSettings({ cryDetection: value })}
          />
          {isCamera ? (
            <>
              <Choice
                label="Bildqualität"
                options={[
                  { value: 'low', label: 'Sparsam' },
                  { value: 'balanced', label: 'Normal' },
                  { value: 'high', label: 'Hoch' },
                ]}
                value={settings.quality}
                onChange={value => updateSettings({ quality: value })}
              />
              <Button
                title={facing === 'environment' ? 'Zur Frontkamera' : 'Zur Rückkamera'}
                variant="secondary"
                onPress={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : null}
          <Button
            title={`Wechseln zu ${isCamera ? 'Monitor' : 'Kamera'}`}
            variant="secondary"
            onPress={switchRole}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function DeviceRow({ name, role, self }) {
  return (
    <View style={s.deviceRow}>
      <View style={[s.deviceDot, { backgroundColor: role === P.ROLE_SERVER ? colors.success : colors.accentBright }]} />
      <Text style={s.deviceName} numberOfLines={1}>{name}{self ? ' (du)' : ''}</Text>
      <Text style={s.deviceRole}>{role === P.ROLE_SERVER ? 'Kamera' : 'Monitor'}</Text>
    </View>
  );
}

function Toggle({ label, detail, value, onChange }) {
  return (
    <TouchableOpacity
      style={s.toggleRow}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {detail ? <Text style={s.toggleDetail}>{detail}</Text> : null}
      </View>
      <View style={[s.switch, value && s.switchOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

function Choice({ label, options, value, onChange }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={s.toggleLabel}>{label}</Text>
      <View style={s.choiceRow}>
        {options.map(option => (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[s.choice, value === option.value && s.choiceActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}
          >
            <Text style={[s.choiceText, value === option.value && s.choiceTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLabel: { ...type.caption, color: colors.textFaint },
  headerCode: { ...type.code, color: colors.text, fontSize: 18 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  leaveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  leaveText: { ...type.label, color: colors.textMuted },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  stage: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  video: { flex: 1 },
  stageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stageEmptyText: { ...type.body, color: colors.textFaint },
  stageBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  liveBadge: { backgroundColor: 'rgba(239,68,68,0.85)' },
  stageBadgeText: { ...type.caption, color: '#fff' },

  talk: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  talkActive: { borderColor: colors.danger, backgroundColor: colors.dangerSurface },
  talkText: { ...type.body, color: colors.textMuted, fontWeight: '600' },
  talkTextActive: { color: colors.dangerText },

  lullabyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lullaby: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lullabyActive: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  lullabyText: { ...type.label, color: colors.textMuted },
  lullabyTextActive: { color: colors.accentBright },

  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  deviceDot: { width: 8, height: 8, borderRadius: radius.pill },
  deviceName: { flex: 1, ...type.body, color: colors.text },
  deviceRole: { ...type.label, color: colors.textFaint },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  toggleLabel: { ...type.body, color: colors.text, fontWeight: '500' },
  toggleDetail: { ...type.label, color: colors.textFaint, marginTop: 2, lineHeight: 18 },
  switch: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  knob: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },

  choiceRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  choice: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  choiceText: { ...type.label, color: colors.textMuted },
  choiceTextActive: { color: colors.accentBright },
});
