import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Session persistence, split by sensitivity.
 *
 * The pairing secret and device token are credentials: anyone holding
 * them can watch the camera, so they go to the Android keystore via
 * SecureStore. Preferences are ordinary data and live in AsyncStorage.
 */

const PREFS_KEY = 'babyfunken.prefs.v2'; // gitleaks:allow (AsyncStorage key name, not a secret)
const CREDENTIALS_KEY = 'babyfunken.credentials.v2';

/** @typedef {{ groupId: string, secret: string, deviceToken: string }} Credentials */

export async function loadPreferences() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function savePreferences(patch) {
  try {
    const current = await loadPreferences();
    const next = { ...current, ...patch };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}

/** @returns {Promise<Credentials | null>} */
export async function loadCredentials() {
  try {
    const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** @param {Credentials} credentials */
export async function saveCredentials(credentials) {
  try {
    await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch {
    return false;
  }
}

/** Called when the user leaves a group for good. */
export async function clearCredentials() {
  try {
    await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  } catch {
    // Nothing to delete, or the keystore is unavailable — either is fine.
  }
}
