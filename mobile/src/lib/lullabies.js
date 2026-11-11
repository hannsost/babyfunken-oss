import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { LULLABIES } from '@babyfunken/shared/constants';

/**
 * Plays a bundled lullaby on the camera device.
 *
 * Nothing streams and nothing is fetched: the files ship inside the app,
 * so this works with no internet at all and costs the signaling server
 * nothing but a four-byte event.
 */

const SOURCES = {
  'white-noise': require('../../assets/lullabies/white-noise.mp3'),
  'rain': require('../../assets/lullabies/rain.mp3'),
  'heartbeat': require('../../assets/lullabies/heartbeat.mp3'),
  'musicbox': require('../../assets/lullabies/musicbox.mp3'),
};

export const catalogue = LULLABIES.filter(l => SOURCES[l.id]);

let player = null;
let currentId = null;
let volume = 0.7;

/**
 * Audio mode for a device that is simultaneously capturing the microphone
 * for WebRTC. `mixWithOthers` matters: requesting exclusive focus would
 * duck or stop the capture.
 */
async function ensureAudioMode() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsRecording: true,
      interruptionMode: 'mixWithOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch (error) {
    console.warn('[lullabies] audio mode:', error?.message);
  }
}

export async function play(id) {
  const source = SOURCES[id];
  if (!source) return null;

  await ensureAudioMode();
  stop();

  try {
    player = createAudioPlayer(source);
    player.loop = true;
    player.volume = volume;
    player.play();
    currentId = id;
    return id;
  } catch (error) {
    console.warn('[lullabies] playback failed:', error?.message);
    player = null;
    currentId = null;
    return null;
  }
}

export function stop() {
  if (!player) return;
  try {
    player.pause();
    player.remove();
  } catch {
    // Player already torn down by the runtime.
  }
  player = null;
  currentId = null;
}

export function setVolume(next) {
  volume = Math.min(1, Math.max(0, next));
  if (player) {
    try {
      player.volume = volume;
    } catch {
      // Ignore: the player may have been removed between calls.
    }
  }
  return volume;
}

export function getVolume() {
  return volume;
}

export function playing() {
  return currentId;
}

export function titleOf(id) {
  return catalogue.find(l => l.id === id)?.title ?? null;
}
