/**
 * One place for colour and spacing. A nursery app gets looked at in the
 * dark, so the palette is deliberately low-luminance with a single bright
 * accent, and alert red is the only saturated colour in the set.
 */
export const colors = {
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceRaised: '#1c1c1c',
  border: '#2a2a2a',
  borderStrong: '#3a3a3a',

  text: '#f5f5f5',
  textMuted: '#8a8a8a',
  textFaint: '#585858',

  accent: '#2563eb',
  accentBright: '#5b9aff',
  accentSurface: '#16233f',

  success: '#34d399',
  warning: '#fbbf24',
  danger: '#ef4444',
  dangerSurface: '#3a1111',
  dangerText: '#fca5a5',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

export const type = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  code: { fontSize: 22, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
};
