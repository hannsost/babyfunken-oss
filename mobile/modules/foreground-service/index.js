import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Android foreground service that keeps a Babyfunken session alive while
 * the screen is off. On other platforms every call is a no-op, so callers
 * never need a Platform check.
 */
const native = Platform.OS === 'android'
  ? requireOptionalNativeModule('BabyfunkenForegroundService')
  : null;

export const MODE_CAMERA = 'camera';
export const MODE_MONITOR = 'monitor';

/** True when the native service is present in this build. */
export const isSupported = native != null;

/**
 * Starts the service. Must be called while the app is in the foreground:
 * Android rejects background starts of a camera service.
 *
 * @param {'camera'|'monitor'} mode  Which foreground service type to claim.
 * @param {string} title
 * @param {string} body
 */
export async function start(mode, title, body = '') {
  if (!native) return false;
  await native.start(mode, title, body);
  return true;
}

/** Updates the text of the ongoing notification. Safe to call often. */
export async function update(title, body = '') {
  if (!native) return false;
  await native.update(title, body);
  return true;
}

/** Stops the service and drops the wake lock. */
export async function stop() {
  if (!native) return false;
  await native.stop();
  return true;
}

/** Whether the service is currently running. */
export function isRunning() {
  if (!native) return false;
  try {
    return native.isRunning();
  } catch {
    return false;
  }
}

export default { start, update, stop, isRunning, isSupported, MODE_CAMERA, MODE_MONITOR };
