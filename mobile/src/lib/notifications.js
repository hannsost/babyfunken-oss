import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

/**
 * Alert notifications.
 *
 * These are separate from the ongoing service notification: a cry alert
 * has to break through, so it lands on its own MAX-importance channel
 * that bypasses Do Not Disturb where the user allows it.
 */

export const ALERT_CHANNEL = 'babyfunken_alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: 'Alarme',
      description: 'Schrei- und Bewegungsalarme aus dem Kinderzimmer.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 120, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      enableVibrate: true,
      sound: 'default',
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Fires an alert immediately. Safe to call while the app is backgrounded. */
export async function notifyAlert({ type, from }) {
  const title = type === 'cry' ? 'Schrei erkannt' : 'Bewegung erkannt';
  const body = from ? `Kamera: ${from}` : 'Babyfunken Alarm';

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 400, 120, 400],
        ...(Platform.OS === 'android' ? { channelId: ALERT_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch (error) {
    console.warn('[notifications] could not post alert:', error?.message);
  }
}
