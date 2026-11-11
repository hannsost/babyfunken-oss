import { useEffect, useRef } from 'react';
import * as P from '@babyfunken/shared/protocol';
import { CryDetector } from '../lib/cryDetector.js';
import { MotionDetector } from '../lib/motionDetector.js';

/**
 * The camera side in a browser: shows what is being sent, runs cry and
 * motion detection locally, and plays lullabies out of this device's
 * speakers. Detection happens here rather than on the server so the
 * signaling box stays a relay.
 */
export default function ServerView({ localStream, signaling, settings, nowPlaying }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && localStream) videoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!localStream || !settings?.cryDetection) return undefined;
    const detector = new CryDetector(localStream, {
      onCry: () => signaling.emit(P.ALERT_CRY, {}),
    });
    detector.start();
    return () => detector.stop();
  }, [localStream, settings?.cryDetection, signaling]);

  useEffect(() => {
    if (!videoRef.current || !settings?.motionDetection) return undefined;
    const detector = new MotionDetector(videoRef.current, {
      onMotion: () => signaling.emit(P.ALERT_MOTION, {}),
    });
    detector.start();
    return () => detector.stop();
  }, [settings?.motionDetection, signaling]);

  // Lullabies are bundled with the app, so this works offline too.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!nowPlaying) {
      audio.pause();
      return;
    }
    audio.src = `/lullabies/${nowPlaying}.mp3`;
    audio.loop = true;
    audio.play().catch(() => {
      // Autoplay blocked until the page has been interacted with.
    });
  }, [nowPlaying]);

  return (
    <div style={s.wrap}>
      <div style={s.stage}>
        <video ref={videoRef} autoPlay playsInline muted style={s.video} />
        <span style={s.badge}>SENDET</span>
      </div>
      <audio ref={audioRef} style={{ display: 'none' }} />
      <p style={s.note}>
        Dieses Gerät sendet Bild und Ton. Schrei- und Bewegungserkennung laufen
        direkt hier — es verlässt nichts das Gerät außer dem verschlüsselten Stream.
      </p>
    </div>
  );
}

const s = {
  wrap: { display: 'grid', gap: 12 },
  stage: {
    position: 'relative', aspectRatio: '16 / 9', background: '#000',
    borderRadius: 12, overflow: 'hidden', border: '1px solid #2a2a2a',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  badge: {
    position: 'absolute', top: 12, left: 12, background: 'rgba(0,0,0,0.6)',
    color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: 1,
    padding: '3px 8px', borderRadius: 6,
  },
  note: { fontSize: 13, color: '#585858', lineHeight: 1.5, margin: 0 },
};
