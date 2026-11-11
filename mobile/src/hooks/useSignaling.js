import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as P from '@babyfunken/shared/protocol';
import { SERVER_URL } from '../config';
import { loadCredentials, saveCredentials, clearCredentials } from '../lib/storage';

/**
 * Connection to the signaling server.
 *
 * Reconnection is the whole point of this hook. A phone acting as a
 * camera will lose its socket every time the network hiccups overnight,
 * and the parent asleep in the next room must not have to touch it — so
 * the device token is persisted and replayed automatically on every
 * reconnect.
 */
export default function useSignaling() {
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());
  const sessionRef = useRef(null);   // { groupId, secret, deviceToken, displayName, role }

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(Boolean(SERVER_URL));
  const [myDeviceId, setMyDeviceId] = useState(null);
  const [secret, setSecret] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [pairing, setPairing] = useState({ open: false, pairingOpenUntil: 0 });
  const [iceServers, setIceServers] = useState([]);
  const [socketError, setSocketError] = useState(null);

  // A missing server URL is a build-time fact, not an event, so it is
  // derived rather than pushed into state from an effect.
  const error = SERVER_URL ? socketError : 'Kein Server konfiguriert.';

  /** Dispatches to every handler registered for `event`. */
  const dispatch = useCallback((event, payload) => {
    const handlers = listenersRef.current.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`[signaling] handler for ${event} threw:`, err?.message);
      }
    }
  }, []);

  useEffect(() => {
    if (!SERVER_URL) return undefined;

    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      timeout: 10_000,
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      setMyDeviceId(socket.id);
      setSocketError(null);
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setConnecting(false);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setMyDeviceId(null);
      // groupId is deliberately kept: the UI should stay on the active
      // screen and show "reconnecting" rather than dumping the parent
      // back to a setup form in the middle of the night.
      setDevices([]);
    });

    socket.on(P.HELLO_ACK, ({ iceServers: ice, protocol }) => {
      if (protocol !== P.PROTOCOL_VERSION) {
        setSocketError('Diese App-Version passt nicht zum Server. Bitte aktualisieren.');
        return;
      }
      if (Array.isArray(ice)) setIceServers(ice);

      // Re-enter the group after a reconnect, using the stored token.
      const session = sessionRef.current;
      if (session?.groupId) {
        socket.emit(P.GROUP_JOIN, {
          groupId: session.groupId,
          secret: session.secret,
          deviceToken: session.deviceToken,
          displayName: session.displayName,
        });
      }
    });

    socket.on(P.GROUP_CREATED, async ({ groupId: id, secret: groupSecret, deviceToken }) => {
      sessionRef.current = { ...sessionRef.current, groupId: id, secret: groupSecret, deviceToken };
      setSecret(groupSecret);
      await saveCredentials({ groupId: id, secret: groupSecret, deviceToken });
    });

    socket.on(P.GROUP_JOINED, async ({ groupId: id, deviceToken, devices: list, pairing: state }) => {
      setGroupId(id);
      setDevices(list ?? []);
      setSocketError(null);
      if (state) setPairing(state);

      sessionRef.current = { ...sessionRef.current, groupId: id, deviceToken };
      const existing = await loadCredentials();
      const known = sessionRef.current.secret ?? existing?.secret ?? '';
      sessionRef.current.secret = known;
      setSecret(known || null);
      await saveCredentials({ groupId: id, secret: known, deviceToken });

      // Re-announce our role so the camera knows to offer us a stream.
      if (sessionRef.current.role) {
        socket.emit(P.ROLE_SET, { role: sessionRef.current.role });
      }
    });

    socket.on(P.GROUP_ERROR, ({ code, message }) => {
      setSocketError(message ?? 'Verbindung fehlgeschlagen.');
      // Only a dead group invalidates the stored session. A closed pairing
      // window or a rate limit is temporary and the credentials still hold.
      if (code === P.ERR_GROUP_NOT_FOUND) {
        sessionRef.current = null;
        setGroupId(null);
        setDevices([]);
        setSecret(null);
        clearCredentials();
      }
    });

    socket.on(P.PAIRING_STATE, setPairing);

    socket.on(P.GROUP_DEVICE_JOINED, ({ device }) =>
      setDevices(prev => [...prev.filter(d => d.deviceId !== device.deviceId), device]));
    socket.on(P.GROUP_DEVICE_LEFT, ({ deviceId }) =>
      setDevices(prev => prev.filter(d => d.deviceId !== deviceId)));
    socket.on(P.GROUP_DEVICE_UPDATED, ({ device }) =>
      setDevices(prev => prev.map(d => (d.deviceId === device.deviceId ? device : d))));

    const relayed = [
      P.SIGNAL_OFFER, P.SIGNAL_ANSWER, P.SIGNAL_ICE, P.SIGNAL_INITIATE, P.SIGNAL_RESTART,
      P.ALERT_MOTION, P.ALERT_CRY,
      P.LULLABY_PLAY, P.LULLABY_STOP, P.LULLABY_STATUS, P.LULLABY_VOLUME,
    ];
    for (const event of relayed) {
      socket.on(event, payload => dispatch(event, payload));
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [dispatch]);

  /** Subscribes to a relayed event. Returns an unsubscribe function. */
  const on = useCallback((event, handler) => {
    const handlers = listenersRef.current.get(event) ?? new Set();
    handlers.add(handler);
    listenersRef.current.set(event, handlers);
    return () => handlers.delete(handler);
  }, []);

  const emit = useCallback((event, payload) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const createGroup = useCallback((displayName, role) => {
    sessionRef.current = { displayName, role };
    setSocketError(null);
    emit(P.GROUP_CREATE, { displayName });
  }, [emit]);

  const joinGroup = useCallback(({ groupId: id, secret, deviceToken, displayName, role }) => {
    sessionRef.current = { groupId: id, secret, deviceToken, displayName, role };
    setSecret(secret ?? null);
    setSocketError(null);
    emit(P.GROUP_JOIN, { groupId: id, secret, deviceToken, displayName });
  }, [emit]);

  const leaveGroup = useCallback(async () => {
    emit(P.GROUP_LEAVE, {});
    sessionRef.current = null;
    setGroupId(null);
    setDevices([]);
    setSecret(null);
    setSocketError(null);
    await clearCredentials();
  }, [emit]);

  const setRole = useCallback((role) => {
    sessionRef.current = { ...sessionRef.current, role };
    emit(P.ROLE_SET, { role });
  }, [emit]);

  const openPairing = useCallback(() => emit(P.PAIRING_OPEN, {}), [emit]);
  const closePairing = useCallback(() => emit(P.PAIRING_CLOSE, {}), [emit]);

  return {
    connected,
    connecting,
    groupId,
    devices,
    pairing,
    iceServers,
    error,
    myDeviceId,
    secret,
    createGroup,
    joinGroup,
    leaveGroup,
    setRole,
    openPairing,
    closePairing,
    on,
    emit,
  };
}
