/**
 * Expo app configuration.
 *
 * Native projects are generated from this file (Continuous Native
 * Generation), so android/ and ios/ are never committed — the package id,
 * version and permissions here are the single source of truth.
 *
 * Deployment-specific values arrive through the environment so the same
 * source builds against staging and production. See docs/CONFIGURATION.md.
 */

const VERSION = '2.0.0';

/** Bumped on every store upload. EAS manages this remotely; see eas.json. */
const ANDROID_VERSION_CODE = 1;

export default ({ config }) => ({
  ...config,
  name: 'Babyfunken',
  slug: 'babyfunken',
  version: VERSION,
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  scheme: 'babyfunken',
  icon: './assets/icon.png',
  primaryColor: '#2563eb',
  assetBundlePatterns: ['**/*'],

  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0a0a',
  },

  android: {
    package: 'de.babyfunken.app',
    versionCode: ANDROID_VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-mono.png',
      backgroundColor: '#0a0a0a',
    },
    // Keeps the app out of the hands of devices that cannot run it.
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'babyfunken', host: 'join' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  ios: {
    bundleIdentifier: 'de.babyfunken.app',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Babyfunken überträgt das Kamerabild dieses Geräts verschlüsselt an deine gekoppelten Geräte.',
      NSMicrophoneUsageDescription:
        'Babyfunken überträgt den Ton dieses Geräts und erkennt daran, ob dein Baby schreit.',
      UIBackgroundModes: ['audio', 'voip'],
    },
  },

  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          // Play requires 16 KB page alignment for new uploads.
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Babyfunken überträgt das Kamerabild dieses Geräts an deine gekoppelten Geräte.',
        microphonePermission:
          'Babyfunken überträgt den Ton dieses Geräts an deine gekoppelten Geräte.',
        recordAudioAndroid: true,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#2563eb',
      },
    ],
    'expo-audio',
    '@config-plugins/react-native-webrtc',
    './plugins/withBabyfunkenAndroid',
  ],

  extra: {
    /**
     * Signaling server. Overridable per build so a release candidate can
     * be pointed at staging without touching source.
     */
    serverUrl: process.env.BABYFUNKEN_SERVER_URL ?? 'https://signal.babyfunken.de',
    privacyPolicyUrl: process.env.BABYFUNKEN_PRIVACY_URL ?? 'https://babyfunken.de/datenschutz',
    supportEmail: process.env.BABYFUNKEN_SUPPORT_EMAIL ?? 'support@babyfunken.de',
    eas: { projectId: 'd9f663fc-ef5c-4399-993f-71d3e559e162' },
  },
});
