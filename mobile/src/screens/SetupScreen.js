import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ROLE_CLIENT, ROLE_SERVER } from '@babyfunken/shared/protocol';
import { Banner, Button, Card, StatusDot } from '../components/ui';
import QRScanner from '../components/QRScanner';
import { loadCredentials, loadPreferences, savePreferences } from '../lib/storage';
import { colors, radius, spacing, type } from '../theme';
import { APP_VERSION } from '../config';

/**
 * First screen: name this device, pick what it does, then either start a
 * new group or join one by scanning the other device's code.
 */
export default function SetupScreen({ signaling, onReady, pendingInvite, onInviteHandled }) {
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(ROLE_CLIENT);
  const [saved, setSaved] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      const [prefs, credentials] = await Promise.all([loadPreferences(), loadCredentials()]);
      if (prefs.displayName) setDisplayName(prefs.displayName);
      if (prefs.role) setRole(prefs.role);
      setSaved(credentials);
    })();
  }, []);

  // The screen is busy from the moment a request goes out until the
  // server either confirms the group or reports why it could not. Both
  // are already state, so this is derived rather than tracked.
  const busy = submitted && !signaling.error && !signaling.groupId;
  const nameValid = displayName.trim().length >= 2;

  async function persist() {
    await savePreferences({ displayName: displayName.trim(), role });
  }

  async function create() {
    await persist();
    setSubmitted(true);
    // The role is handed up immediately; App only swaps screens once the
    // server has actually confirmed a group, so a failed attempt stays here.
    onReady(role);
    signaling.createGroup(displayName.trim(), role);
  }

  async function join({ groupId, secret, displayName: name }) {
    await persist();
    setSubmitted(true);
    setScanning(false);
    onReady(role);
    onInviteHandled?.();
    signaling.joinGroup({
      groupId,
      secret,
      displayName: name ?? displayName.trim(),
      role,
    });
  }

  async function reconnect() {
    if (!saved) return;
    await persist();
    setSubmitted(true);
    onReady(role);
    signaling.joinGroup({
      groupId: saved.groupId,
      secret: saved.secret,
      deviceToken: saved.deviceToken,
      displayName: displayName.trim() || 'Gerät',
      role,
    });
  }

  if (scanning) {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <QRScanner
          onScanned={(invite) => join(invite)}
          onCancel={() => setScanning(false)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.brand}>
            <Text style={s.title}>Babyfunken</Text>
            <View style={s.connection}>
              <StatusDot state={signaling.connected ? 'connected' : signaling.connecting ? 'connecting' : 'failed'} />
              <Text style={s.connectionText}>
                {signaling.connected ? 'Verbunden' : signaling.connecting ? 'Verbinde…' : 'Keine Verbindung'}
              </Text>
            </View>
          </View>

          {signaling.error ? <Banner title={signaling.error} /> : null}

          <Card title="DIESES GERÄT">
            <TextInput
              style={s.input}
              placeholder="Name, z. B. Handy Papa"
              placeholderTextColor={colors.textFaint}
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={40}
              autoCapitalize="sentences"
              accessibilityLabel="Gerätename"
            />

            <View style={s.roleRow}>
              <RoleOption
                label="Kamera"
                detail="Beim Baby"
                active={role === ROLE_SERVER}
                onPress={() => setRole(ROLE_SERVER)}
              />
              <RoleOption
                label="Monitor"
                detail="Bei dir"
                active={role === ROLE_CLIENT}
                onPress={() => setRole(ROLE_CLIENT)}
              />
            </View>
          </Card>

          {pendingInvite ? (
            <Card title="EINLADUNG">
              <Text style={s.savedCode}>{pendingInvite.groupId}</Text>
              <Text style={s.hint}>
                Du wurdest zu dieser Gruppe eingeladen.
              </Text>
              <Button
                title="Einladung annehmen"
                onPress={() => join(pendingInvite)}
                busy={busy}
                disabled={!nameValid || !signaling.connected}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          {saved && !pendingInvite ? (
            <Card title="ZULETZT VERWENDET">
              <Text style={s.savedCode}>{saved.groupId}</Text>
              <Button
                title="Wieder verbinden"
                onPress={reconnect}
                busy={busy}
                disabled={!signaling.connected}
                style={{ marginTop: spacing.md }}
              />
            </Card>
          ) : null}

          <Card title={saved || pendingInvite ? 'ODER NEU' : 'LOSLEGEN'}>
            <Button
              title="Neue Gruppe erstellen"
              variant={saved || pendingInvite ? 'secondary' : 'primary'}
              onPress={create}
              busy={busy && !saved && !pendingInvite}
              disabled={!nameValid || !signaling.connected}
            />
            <Button
              title="Gerät koppeln (QR scannen)"
              variant="secondary"
              onPress={() => setScanning(true)}
              disabled={!nameValid || !signaling.connected}
              style={{ marginTop: spacing.sm }}
            />
            {!nameValid ? (
              <Text style={s.hint}>Gib diesem Gerät zuerst einen Namen.</Text>
            ) : null}
          </Card>

          <Text style={s.version}>Version {APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleOption({ label, detail, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[s.roleOption, active && s.roleOptionActive]}
    >
      <Text style={[s.roleLabel, active && s.roleLabelActive]}>{label}</Text>
      <Text style={s.roleDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...type.display, color: colors.text },
  connection: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  connectionText: { ...type.label, color: colors.textMuted },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 14,
    color: colors.text,
    ...type.body,
  },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  roleOption: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  roleOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  roleLabel: { ...type.body, fontWeight: '600', color: colors.textMuted },
  roleLabelActive: { color: colors.accentBright },
  roleDetail: { ...type.label, color: colors.textFaint, marginTop: 2 },

  savedCode: { ...type.code, color: colors.text },
  hint: { ...type.label, color: colors.textFaint, marginTop: spacing.sm, textAlign: 'center' },
  version: { ...type.label, color: colors.textFaint, textAlign: 'center', marginTop: spacing.lg },
});
