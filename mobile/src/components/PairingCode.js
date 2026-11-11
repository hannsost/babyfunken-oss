import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { buildPairingUrl } from '@babyfunken/shared/constants';
import { Button } from './ui';
import { SERVER_URL } from '../config';
import { colors, radius, spacing, type } from '../theme';

/**
 * Shows the QR code another device scans to join.
 *
 * Displayed only while the pairing window is open, and the window is
 * closed again as soon as the second device is in — a code left on
 * screen indefinitely is a code that ends up photographed.
 */
export default function PairingCode({ groupId, secret, open, secondsLeft, onOpen, onClose }) {
  if (!secret) {
    return (
      <View style={s.locked}>
        <Text style={s.lockedText}>
          Dieses Gerät kennt den Kopplungsschlüssel nicht. Neue Geräte müssen von dem
          Gerät hinzugefügt werden, das die Gruppe erstellt hat.
        </Text>
      </View>
    );
  }

  const url = buildPairingUrl(groupId, secret);
  // Web fallback, so the link also works for someone without the app.
  const webUrl = `${SERVER_URL}/?g=${groupId}&s=${encodeURIComponent(secret)}`;

  const share = () => {
    Share.share({
      message:
        'Mit Babyfunken verbinden:\n' +
        `${webUrl}\n\n` +
        'Mit installierter App:\n' +
        `${url}\n\n` +
        'Wer diesen Link hat, kann das Kamerabild sehen — teile ihn nur mit Personen, ' +
        'denen du dein Kind anvertraust.',
    }).catch(() => {});
  };

  if (!open) {
    return (
      <View>
        <Text style={s.hint}>
          Die Kopplung ist geschlossen. Neue Geräte können gerade nicht beitreten.
        </Text>
        <Button title="Kopplung öffnen" onPress={onOpen} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <View style={s.qrFrame}>
        <QRCode value={url} size={200} backgroundColor="#ffffff" color="#0a0a0a" />
      </View>

      <Text style={s.code}>{groupId}</Text>
      <Text style={s.hint}>
        {secondsLeft > 0
          ? `Noch ${Math.ceil(secondsLeft / 60)} Minuten offen.`
          : 'Kopplung läuft ab.'}
      </Text>

      <Button title="Link teilen" variant="secondary" onPress={share} style={{ marginTop: spacing.md, alignSelf: 'stretch' }} />
      <Button title="Kopplung schließen" variant="secondary" onPress={onClose} style={{ marginTop: spacing.sm, alignSelf: 'stretch' }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center' },
  qrFrame: { padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.lg },
  code: { ...type.code, color: colors.text, marginTop: spacing.lg },
  hint: { ...type.label, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center', lineHeight: 19 },
  locked: { padding: spacing.sm },
  lockedText: { ...type.label, color: colors.textMuted, lineHeight: 19 },
});
