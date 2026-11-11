import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import * as P from '@babyfunken/shared/protocol';

/**
 * Peer connections to every other device in the group.
 *
 * Three things here exist because the naive version breaks in a nursery:
 *
 * - Perfect negotiation. Both ends can renegotiate (the camera when it
 *   switches lens, the monitor when it starts talking), so offers collide.
 *   The camera is the impolite peer and wins; monitors roll back.
 * - Buffered ICE candidates. Candidates routinely arrive before the
 *   remote description, and dropping them costs a connection.
 * - ICE restart rather than teardown. Phones change networks; a failed
 *   connection should recover without the parent noticing.
 */

const ICE_RESTART_DELAY_MS = 2_000;

export default function useWebRTC({ signaling, localStream, role, iceServers }) {
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [peerStates, setPeerStates] = useState(new Map());

  // Refs so the socket handlers never close over stale values.
  const roleRef = useRef(role);
  const localStreamRef = useRef(localStream);
  const iceServersRef = useRef(iceServers);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { iceServersRef.current = iceServers; }, [iceServers]);

  const publishStreams = useCallback(() => {
    const next = new Map();
    for (const [peerId, peer] of peersRef.current) {
      const tracks = peer.pc.getReceivers().map(r => r.track).filter(Boolean);
      if (tracks.length) next.set(peerId, new MediaStream(tracks));
    }
    setRemoteStreams(next);
  }, []);

  const publishStates = useCallback(() => {
    const next = new Map();
    for (const [peerId, peer] of peersRef.current) next.set(peerId, peer.pc.connectionState);
    setPeerStates(next);
  }, []);

  /** Renegotiates with fresh ICE rather than dropping the session. */
  const scheduleIceRestart = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || peer.restartTimer) return;

    peer.restartTimer = setTimeout(async () => {
      peer.restartTimer = null;
      const { pc } = peer;
      if (pc.connectionState === 'closed') return;
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        signaling.emit(P.SIGNAL_OFFER, { targetDeviceId: peerId, sdp: pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] ICE restart failed:', error?.message);
      }
    }, ICE_RESTART_DELAY_MS);
  }, [signaling]);

  const createPeer = useCallback((peerId) => {
    peersRef.current.get(peerId)?.pc.close();

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current ?? [],
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
    });

    /** The camera never yields on a collision; monitors always do. */
    const polite = roleRef.current !== P.ROLE_SERVER;

    const peer = {
      pc,
      polite,
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

    pc.ontrack = () => { setTimeout(publishStreams, 80); };

    pc.onconnectionstatechange = () => {
      publishStates();
      if (pc.connectionState === 'failed') scheduleIceRestart(peerId);
      if (pc.connectionState === 'closed') {
        peersRef.current.delete(peerId);
        publishStreams();
        publishStates();
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const offer = await pc.createOffer({});
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        signaling.emit(P.SIGNAL_OFFER, { targetDeviceId: peerId, sdp: pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] negotiation failed:', error?.message);
      } finally {
        peer.makingOffer = false;
      }
    };

    // Outgoing media. The camera sends what it captures; a monitor keeps
    // a silent audio transceiver open so push-to-talk can swap a track in
    // later without renegotiating mid-conversation.
    if (roleRef.current === P.ROLE_SERVER && localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    } else {
      const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.audioSender = transceiver.sender;
    }

    return peer;
  }, [signaling, publishStreams, publishStates, scheduleIceRestart]);

  /** Applies candidates that arrived before the remote description did. */
  const flushCandidates = useCallback(async (peer) => {
    const queued = peer.pendingCandidates.splice(0);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[webrtc] dropped candidate:', error?.message);
      }
    }
  }, []);

  useEffect(() => {
    const offInitiate = signaling.on(P.SIGNAL_INITIATE, async ({ peerDeviceId }) => {
      if (roleRef.current !== P.ROLE_SERVER) return;
      createPeer(peerDeviceId);   // onnegotiationneeded drives the offer
    });

    const offOffer = signaling.on(P.SIGNAL_OFFER, async ({ fromDeviceId, sdp }) => {
      let peer = peersRef.current.get(fromDeviceId);
      if (!peer || peer.pc.signalingState === 'closed') peer = createPeer(fromDeviceId);
      const { pc } = peer;

      const readyForOffer =
        !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
      const collision = !readyForOffer;

      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;

      try {
        if (collision) {
          // Polite peer: discard our own in-flight offer and take theirs.
          await pc.setLocalDescription({ type: 'rollback' });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushCandidates(peer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.emit(P.SIGNAL_ANSWER, { targetDeviceId: fromDeviceId, sdp: pc.localDescription });
      } catch (error) {
        console.warn('[webrtc] could not answer offer:', error?.message);
      }
    });

    const offAnswer = signaling.on(P.SIGNAL_ANSWER, async ({ fromDeviceId, sdp }) => {
      const peer = peersRef.current.get(fromDeviceId);
      if (!peer) return;
      try {
        peer.settingRemoteAnswer = true;
        await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushCandidates(peer);
      } catch (error) {
        console.warn('[webrtc] could not apply answer:', error?.message);
      } finally {
        peer.settingRemoteAnswer = false;
      }
    });

    const offIce = signaling.on(P.SIGNAL_ICE, async ({ fromDeviceId, candidate }) => {
      const peer = peersRef.current.get(fromDeviceId);
      if (!peer || !candidate) return;

      if (!peer.pc.remoteDescription) {
        peer.pendingCandidates.push(candidate);
        return;
      }
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        if (!peer.ignoreOffer) console.warn('[webrtc] bad candidate:', error?.message);
      }
    });

    return () => { offInitiate(); offOffer(); offAnswer(); offIce(); };
  }, [signaling, createPeer, flushCandidates]);

  // Swap the outgoing camera/mic tracks in place when the local stream
  // changes (lens switch, quality change) — no renegotiation needed.
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
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      pttTrackRef.current = track;
      for (const peer of peersRef.current.values()) {
        await peer.audioSender?.replaceTrack(track);
      }
    } catch (error) {
      console.warn('[webrtc] microphone unavailable:', error?.message);
    }
  }, []);

  const stopPTT = useCallback(async () => {
    const track = pttTrackRef.current;
    if (!track) return;
    pttTrackRef.current = null;
    for (const peer of peersRef.current.values()) {
      await peer.audioSender?.replaceTrack(null);
    }
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

  // Changing role invalidates every connection: the direction of media
  // reverses, so the peers have to be rebuilt from scratch.
  useEffect(() => () => closeAll(), [role, closeAll]);

  /** Live peer connections — the cry detector reads audio levels off these. */
  const getPeerConnections = useCallback(
    () => [...peersRef.current.values()].map(p => p.pc),
    [],
  );

  return { remoteStreams, peerStates, startPTT, stopPTT, closeAll, getPeerConnections };
}
