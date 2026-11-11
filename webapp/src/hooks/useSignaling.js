import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as P from '@babyfunken/shared/protocol';

const STORAGE_KEY = 'babyfunken.session.v2';

/**
 * Connection to the signaling server, protocol v3.
 *
 * Credentials live in localStorage so a reloaded tab rejoins silently.
 * That is weaker than the Android keystore the app uses, which is exactly
 * why the browser is documented as the convenience client: use a phone
 * for the camera.
 */
function readSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or storage disabled — the session just will not persist.
  }
}

/** Read once at import, so render never touches storage. */
const INITIAL_SESSION = readSession();

export default function useSignaling(serverUrl) {
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());
  const sessionRef = useRef(INITIAL_SESSION);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [myDeviceId, setMyDeviceId] = useState(null);
  const [secret, setSecret] = useState(INITIAL_SESSION?.secret ?? null);
  const [savedSession, setSavedSession] = useState(INITIAL_SESSION);
  const [groupId, setGroupId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [pairing, setPairing] = useState({ open: false, pairingOpenUntil: 0 });
  const [iceServers, setIceServers] = useState([]);
  const [error, setError] = useState(null);

  const dispatch = useCallback((event, payload) => {
    for (const handler of [...(listenersRef.current.get(event) ?? [])]) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`[signaling] handler for ${event} threw:`, err);
      }
    }
  }, []);

  useEffect(() => {
    const socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      setMyDeviceId(socket.id);
      setError(null);
    });
    socket.on('connect_error', () => { setConnected(false); setConnecting(false); });
    socket.on('disconnect', () => { setConnected(false); setMyDeviceId(null); setDevices([]); });

    socket.on(P.HELLO_ACK, ({ iceServers: ice, protocol }) => {
      if (protocol !== P.PROTOCOL_VERSION) {
        setError('Diese Seite ist veraltet. Bitte neu laden.');
        return;
      }
      if (Array.isArray(ice)) setIceServers(ice);

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

    socket.on(P.GROUP_CREATED, ({ groupId: id, secret: groupSecret, deviceToken }) => {
      sessionRef.current = { ...sessionRef.current, groupId: id, secret: groupSecret, deviceToken };
      writeSession(sessionRef.current);
      setSecret(groupSecret);
      setSavedSession(sessionRef.current);
    });

    socket.on(P.GROUP_JOINED, ({ groupId: id, deviceToken, devices: list, pairing: state }) => {
      setGroupId(id);
      setDevices(list ?? []);
      setError(null);
      if (state) setPairing(state);

      sessionRef.current = { ...sessionRef.current, groupId: id, deviceToken };
      writeSession(sessionRef.current);
      setSavedSession(sessionRef.current);

      if (sessionRef.current.role) socket.emit(P.ROLE_SET, { role: sessionRef.current.role });
    });

    socket.on(P.GROUP_ERROR, ({ code, message }) => {
      setError(message ?? 'Verbindung fehlgeschlagen.');
      if (code === P.ERR_GROUP_NOT_FOUND) {
        sessionRef.current = null;
        writeSession(null);
        setGroupId(null);
        setDevices([]);
        setSecret(null);
        setSavedSession(null);
      }
    });

    socket.on(P.PAIRING_STATE, setPairing);

    socket.on(P.GROUP_DEVICE_JOINED, ({ device }) =>
      setDevices(prev => [...prev.filter(d => d.deviceId !== device.deviceId), device]));
    socket.on(P.GROUP_DEVICE_LEFT, ({ deviceId }) =>
      setDevices(prev => prev.filter(d => d.deviceId !== deviceId)));
    socket.on(P.GROUP_DEVICE_UPDATED, ({ device }) =>
      setDevices(prev => prev.map(d => (d.deviceId === device.deviceId ? device : d))));

    for (const event of [
      P.SIGNAL_OFFER, P.SIGNAL_ANSWER, P.SIGNAL_ICE, P.SIGNAL_INITIATE, P.SIGNAL_RESTART,
      P.ALERT_MOTION, P.ALERT_CRY,
      P.LULLABY_PLAY, P.LULLABY_STOP, P.LULLABY_STATUS, P.LULLABY_VOLUME,
    ]) {
      socket.on(event, payload => dispatch(event, payload));
    }

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl, dispatch]);

  const on = useCallback((event, handler) => {
    const handlers = listenersRef.current.get(event) ?? new Set();
    handlers.add(handler);
    listenersRef.current.set(event, handlers);
    return () => handlers.delete(handler);
  }, []);

  const emit = useCallback((event, payload) => socketRef.current?.emit(event, payload), []);

  const createGroup = useCallback((displayName, role) => {
    sessionRef.current = { displayName, role };
    setError(null);
    emit(P.GROUP_CREATE, { displayName });
  }, [emit]);

  const joinGroup = useCallback(({ groupId: id, secret, deviceToken, displayName, role }) => {
    sessionRef.current = { groupId: id, secret, deviceToken, displayName, role };
    setSecret(secret ?? null);
    setError(null);
    emit(P.GROUP_JOIN, { groupId: id, secret, deviceToken, displayName });
  }, [emit]);

  const leaveGroup = useCallback(() => {
    emit(P.GROUP_LEAVE, {});
    sessionRef.current = null;
    writeSession(null);
    setGroupId(null);
    setDevices([]);
    setSecret(null);
    setSavedSession(null);
    setError(null);
  }, [emit]);

  const setRole = useCallback((role) => {
    sessionRef.current = { ...sessionRef.current, role };
    writeSession(sessionRef.current);
    emit(P.ROLE_SET, { role });
  }, [emit]);

  return {
    connected, connecting, groupId, devices, pairing, iceServers, error,
    myDeviceId,
    secret,
    savedSession,
    createGroup, joinGroup, leaveGroup, setRole,
    openPairing: () => emit(P.PAIRING_OPEN, {}),
    closePairing: () => emit(P.PAIRING_CLOSE, {}),
    on, emit,
  };
}
