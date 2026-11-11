import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

/** Signaling server. Baked in per build — see app.config.js. */
export const SERVER_URL = extra.serverUrl;

export const PRIVACY_POLICY_URL = extra.privacyPolicyUrl;
export const SUPPORT_EMAIL = extra.supportEmail;

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const BUILD_NUMBER = Constants.expoConfig?.android?.versionCode ?? 0;

if (__DEV__ && !SERVER_URL) {
  console.warn('[config] No serverUrl configured — set BABYFUNKEN_SERVER_URL');
}
