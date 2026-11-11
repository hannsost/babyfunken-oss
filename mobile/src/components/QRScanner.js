import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parsePairingUrl } from '@babyfunken/shared/constants';
import { Button } from './ui';
import { colors, radius, spacing, type } from '../theme';

/**
 * Scans a pairing QR code.
 *
 * The code carries the group secret, which is why pairing is not just a
 * six-character code typed in by hand: the secret is too long to type and
 * too important to shorten.
 */
export default function QRScanner({ onScanned, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [invalid, setInvalid] = useState(false);
  const handled = useRef(false);

  if (!permission) {
    return <View style={s.container}><Text style={s.hint}>Kamera wird vorbereitet…</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <Text style={s.title}>Kamerazugriff nötig</Text>
        <Text style={s.hint}>
          Zum Koppeln muss Babyfunken den QR-Code des anderen Geräts lesen können.
        </Text>
        <Button title="Kamera erlauben" onPress={requestPermission} style={{ marginTop: spacing.lg }} />
        <Button title="Zurück" variant="secondary" onPress={onCancel} style={{ marginTop: spacing.sm }} />
      </View>
    );
  }

  const handleScan = ({ data }) => {
    if (handled.current) return;
    const parsed = parsePairingUrl(data);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    handled.current = true;
    onScanned(parsed);
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>QR-Code scannen</Text>
      <Text style={s.hint}>
        Öffne auf dem anderen Gerät „Gerät hinzufügen“ und richte die Kamera darauf.
      </Text>

      <View style={s.viewfinder}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={handleScan}
        />
        <View style={s.reticle} pointerEvents="none" />
      </View>

      {invalid ? <Text style={s.invalid}>Das ist kein Babyfunken-Code.</Text> : null}

      <Button title="Abbrechen" variant="secondary" onPress={onCancel} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  title: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  hint: { ...type.body, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 21 },
  viewfinder: {
    aspectRatio: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
  },
  reticle: {
    ...StyleSheet.absoluteFillObject,
    margin: '14%',
    borderWidth: 2,
    borderColor: colors.accentBright,
    borderRadius: radius.lg,
  },
  invalid: { ...type.label, color: colors.dangerText, marginTop: spacing.md, textAlign: 'center' },
});
