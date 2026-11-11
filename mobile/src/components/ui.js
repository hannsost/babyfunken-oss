import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

export function Button({ title, onPress, variant = 'primary', disabled, busy, style }) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      style={[
        s.button,
        isPrimary && s.buttonPrimary,
        isDanger && s.buttonDanger,
        !isPrimary && !isDanger && s.buttonSecondary,
        (disabled || busy) && s.buttonDisabled,
        style,
      ]}
    >
      {busy
        ? <ActivityIndicator color={isPrimary ? colors.text : colors.textMuted} />
        : (
          <Text style={[
            s.buttonText,
            isPrimary && s.buttonTextPrimary,
            isDanger && s.buttonTextDanger,
          ]}>
            {title}
          </Text>
        )}
    </TouchableOpacity>
  );
}

export function Card({ title, children, style }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function StatusDot({ state }) {
  const tint = {
    connected: colors.success,
    connecting: colors.warning,
    failed: colors.danger,
    idle: colors.textFaint,
  }[state] ?? colors.textFaint;

  return <View style={[s.dot, { backgroundColor: tint }]} />;
}

export function Banner({ tone = 'danger', title, detail, onDismiss }) {
  return (
    <View style={[s.banner, tone === 'danger' ? s.bannerDanger : s.bannerNeutral]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, tone === 'danger' && { color: colors.dangerText }]}>{title}</Text>
        {detail ? <Text style={s.bannerDetail}>{detail}</Text> : null}
      </View>
      {onDismiss ? (
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Meldung schließen"
        >
          <Text style={s.bannerClose}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { borderWidth: 1, borderColor: colors.borderStrong },
  buttonDanger: { borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSurface },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...type.body, fontWeight: '600', color: colors.textMuted },
  buttonTextPrimary: { color: '#fff' },
  buttonTextDanger: { color: colors.dangerText },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...type.caption, color: colors.textFaint, marginBottom: spacing.md },

  dot: { width: 9, height: 9, borderRadius: radius.pill },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerDanger: { backgroundColor: colors.dangerSurface, borderColor: colors.danger },
  bannerNeutral: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  bannerTitle: { ...type.body, fontWeight: '600', color: colors.text },
  bannerDetail: { ...type.label, color: colors.textMuted, marginTop: 2 },
  bannerClose: { color: colors.textMuted, fontSize: 16, paddingHorizontal: spacing.xs },
});
