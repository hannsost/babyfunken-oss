import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerGlobals } from 'react-native-webrtc';
import { parsePairingUrl } from '@babyfunken/shared/constants';

import useSignaling from './src/hooks/useSignaling';
import SetupScreen from './src/screens/SetupScreen';
import ActiveScreen from './src/screens/ActiveScreen';
import { colors } from './src/theme';

// Installs RTCPeerConnection and friends onto the global scope. Must run
// before anything touches WebRTC.
registerGlobals();

SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

export default function App() {
  const signaling = useSignaling();
  const [role, setRole] = useState(null);
  const [invite, setInvite] = useState(null);

  // Pairing links (babyfunken://join?g=…&s=…) shared from the camera
  // device, whether the app was cold-started by the link or already open.
  useEffect(() => {
    Linking.getInitialURL()
      .then(url => { if (url) setInvite(parsePairingUrl(url)); })
      .catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = parsePairingUrl(url);
      if (parsed) setInvite(parsed);
    });
    return () => sub.remove();
  }, []);

  const inSession = Boolean(signaling.groupId && role);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.bg} />
      {inSession ? (
        <ActiveScreen
          signaling={signaling}
          role={role}
          onRoleChange={setRole}
          onLeave={() => setRole(null)}
        />
      ) : (
        <SetupScreen
          signaling={signaling}
          onReady={setRole}
          pendingInvite={invite}
          onInviteHandled={() => setInvite(null)}
        />
      )}
    </SafeAreaProvider>
  );
}
