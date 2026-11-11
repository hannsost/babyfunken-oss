import { useCallback, useEffect, useRef, useState } from 'react';
import * as P from '@babyfunken/shared/protocol';

/**
 * Browser peer connections. Mirrors the mobile implementation: perfect
 * negotiation with the camera as the impolite peer, buffered ICE
 * candidates, and ICE restart instead of teardown on failure.
 */
const ICE_RESTART_DELAY_MS = 2000;

export default function useWebRTC({ signaling, localStream, role, iceServers }) {
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [peerStates, setPeerStates] = useState(new Map());

  const roleRef = useRef(role);
  const localStreamRef = useRef(localStream);
  const iceServersRef = useRef(iceServers);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { iceServersRef.current = iceServers; }, [iceServers]);

  const publish = useCallback(() => {
    const streams = new Map();
    const states = new Map();
    for (const [peerId, peer] of peersRef.current) {
      const tracks = peer.pc.getReceivers().map(r => r.track).filter(Boolean);
      if (tracks.length) streams.set(peerId, new MediaStream(tracks));
      states.set(peerId, peer.pc.connectionState);
    }
    setRemoteStreams(streams);
    setPeerStates(states);
  }, []);

  const scheduleIceRestart = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || peer.restartTimer) return;
    peer.restartTimer = setTimeout(async () => {
      peer.restartTimer = null;
      if (peer.pc.connectionState === 'closed') return;
      try {
        await peer.pc.setLocalDescription(await peer.pc.createOffer({ iceRestart: true }));
        signaling.emit(P.SIGNAL_OFFER, { targetDeviceId: peerId, sdp: peer.pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] ICE restart failed:', error);
      }
    }, ICE_RESTART_DELAY_MS);
  }, [signaling]);

  const createPeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.pc.close();

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current ?? [],
      bundlePolicy: 'max-bundle',
    });

    const peer = {
      pc,
      polite: roleRef.current !== P.ROLE_SERVER,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      audioSender: null,
      restartTimer: null,
    };
    peersRef.current.set(peerId, peer);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signaling.emit(P.SIGNAL_ICE, { targetDeviceId: peerId, candidate });
    };
    pc.ontrack = () => setTimeout(publish, 60);
    pc.onconnectionstatechange = () => {
      publish();
      if (pc.connectionState === 'failed') scheduleIceRestart(peerId);
      if (pc.connectionState === 'closed') { peersRef.current.delete(peerId); publish(); }
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        signaling.emit(P.SIGNAL_OFFER, { targetDeviceId: peerId, sdp: pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] negotiation failed:', error);
      } finally {
        peer.makingOffer = false;
      }
    };

    if (roleRef.current === P.ROLE_SERVER && localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    } else {
      peer.audioSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    }

    return peer;
  }, [signaling, publish, scheduleIceRestart]);

  const flushCandidates = useCallback(async (peer) => {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        console.warn('[webrtc] dropped candidate:', error);
      }
    }
  }, []);

  useEffect(() => {
    const offInitiate = signaling.on(P.SIGNAL_INITIATE, ({ peerDeviceId }) => {
      if (roleRef.current !== P.ROLE_SERVER) return;
      createPeer(peerDeviceId);
    });

    const offOffer = signaling.on(P.SIGNAL_OFFER, async ({ fromDeviceId, sdp }) => {
      let peer = peersRef.current.get(fromDeviceId);
      if (!peer || peer.pc.signalingState === 'closed') peer = createPeer(fromDeviceId);
      const { pc } = peer;

      const ready = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
      const collision = !ready;
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;

      try {
        await pc.setRemoteDescription(sdp);   // implicit rollback when polite
        await flushCandidates(peer);
        await pc.setLocalDescription();
        signaling.emit(P.SIGNAL_ANSWER, { targetDeviceId: fromDeviceId, sdp: pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] could not answer offer:', error);
      }
    });

    const offAnswer = signaling.on(P.SIGNAL_ANSWER, async ({ fromDeviceId, sdp }) => {
      const peer = peersRef.current.get(fromDeviceId);
      if (!peer) return;
      try {
        peer.settingRemoteAnswer = true;
        await peer.pc.setRemoteDescription(sdp);
        await flushCandidates(peer);
      } catch (error) {
        console.warn('[webrtc] could not apply answer:', error);
      } finally {
        peer.settingRemoteAnswer = false;
      }
    });

    const offIce = signaling.on(P.SIGNAL_ICE, async ({ fromDeviceId, candidate }) => {
      const peer = peersRef.current.get(fromDeviceId);
      if (!peer || !candidate) return;
      if (!peer.pc.remoteDescription) { peer.pendingCandidates.push(candidate); return; }
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (error) {
        if (!peer.ignoreOffer) console.warn('[webrtc] bad candidate:', error);
      }
    });

    return () => { offInitiate(); offOffer(); offAnswer(); offIce(); };
  }, [signaling, createPeer, flushCandidates]);

  useEffect(() => {
    if (!localStream || roleRef.current !== P.ROLE_SERVER) return;
    for (const { pc } of peersRef.current.values()) {
      const senders = pc.getSenders();
      for (const track of localStream.getTracks()) {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) sender.replaceTrack(track).catch(() => {});
        else pc.addTrack(track, localStream);
      }
    }
  }, [localStream]);

  const pttTrackRef = useRef(null);

  const startPTT = useCallback(async () => {
    if (roleRef.current === P.ROLE_SERVER || pttTrackRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      pttTrackRef.current = track;
      for (const peer of peersRef.current.values()) await peer.audioSender?.replaceTrack(track);
    } catch (error) {
      console.warn('[webrtc] microphone unavailable:', error);
    }
  }, []);

  const stopPTT = useCallback(async () => {
    const track = pttTrackRef.current;
    if (!track) return;
    pttTrackRef.current = null;
    for (const peer of peersRef.current.values()) await peer.audioSender?.replaceTrack(null);
    track.stop();
  }, []);

  const closeAll = useCallback(() => {
    stopPTT();
    for (const peer of peersRef.current.values()) {
      if (peer.restartTimer) clearTimeout(peer.restartTimer);
      peer.pc.close();
    }
    peersRef.current.clear();
    setRemoteStreams(new Map());
    setPeerStates(new Map());
  }, [stopPTT]);

  return { remoteStreams, peerStates, startPTT, stopPTT, closeAll };
}
