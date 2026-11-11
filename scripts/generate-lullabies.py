#!/usr/bin/env python3
"""
Synthesises the four bundled lullabies.

Everything here is generated from scratch, so the audio that ships in the
APK carries no licence obligations at all. Each track is built to loop
without a seam: noise beds are cross-faded head-to-tail, and the rhythmic
tracks contain a whole number of cycles.

Usage: python3 scripts/generate-lullabies.py
Requires: numpy, ffmpeg
"""
import math
import pathlib
import shutil
import subprocess
import sys
import wave

import numpy as np

SR = 44_100
DURATION = 30.0
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'mobile' / 'assets' / 'lullabies'
# The browser client plays the same files, served as static assets.
WEB_OUT = ROOT / 'webapp' / 'public' / 'lullabies'
RNG = np.random.default_rng(20260914)   # fixed seed: reproducible builds


def pink(n):
    """1/f noise — the spectrum of rainfall and of a held breath."""
    white = RNG.standard_normal(n)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    freqs[0] = freqs[1]
    spectrum /= np.sqrt(freqs)
    return np.fft.irfft(spectrum, n)


def seamless(sig, fade=1.5):
    """Cross-fades the tail over the head so a loop point is inaudible."""
    f = int(fade * SR)
    ramp = np.linspace(0, 1, f)
    out = sig.copy()
    out[:f] = sig[:f] * ramp + sig[-f:] * (1 - ramp)
    return out[:-f]


def normalise(sig, peak=0.72):
    sig = sig - np.mean(sig)
    return sig / (np.max(np.abs(sig)) + 1e-12) * peak


def lowpass(sig, cutoff):
    """Single-pole lowpass. Gentle on purpose — a brick wall sounds dead."""
    a = math.exp(-2 * math.pi * cutoff / SR)
    out = np.empty_like(sig)
    acc = 0.0
    for i, x in enumerate(sig):
        acc = (1 - a) * x + a * acc
        out[i] = acc
    return out


def fast_lowpass(sig, cutoff):
    """FFT-domain version of the above, for signals too long to loop over."""
    spectrum = np.fft.rfft(sig)
    freqs = np.fft.rfftfreq(len(sig), 1 / SR)
    spectrum *= 1 / (1 + (freqs / cutoff) ** 2)
    return np.fft.irfft(spectrum, len(sig))


def white_noise():
    n = int((DURATION + 1.5) * SR)
    # Softened white noise: full white is harsh over hours of playback.
    sig = fast_lowpass(pink(n) * 0.6 + RNG.standard_normal(n) * 0.4, 6_000)
    return normalise(seamless(sig), 0.62)


def rain():
    n = int((DURATION + 1.5) * SR)
    bed = fast_lowpass(pink(n), 3_200)

    # Droplets: short high transients scattered through the bed.
    drops = np.zeros(n)
    for _ in range(900):
        at = RNG.integers(0, n - 2000)
        length = RNG.integers(120, 600)
        env = np.exp(-np.linspace(0, 9, length))
        tone = np.sin(2 * np.pi * RNG.uniform(900, 4200) * np.arange(length) / SR)
        drops[at:at + length] += tone * env * RNG.uniform(0.05, 0.22)

    # Slow swell, as though the shower moves past the window.
    t = np.arange(n) / SR
    swell = 1 + 0.18 * np.sin(2 * np.pi * t / DURATION * 2)
    return normalise(seamless(bed * swell + drops * 0.5), 0.66)


def heartbeat():
    """A calm 60 bpm: lub-dub, the sound from before the nursery."""
    beats = int(DURATION)          # 60 bpm → one beat per second, loops exactly
    n = beats * SR
    sig = np.zeros(n)

    def thump(at, freq, amp, decay, length=0.34):
        size = int(length * SR)
        if at + size > n:
            size = n - at
        t = np.arange(size) / SR
        env = np.exp(-decay * t) * (1 - np.exp(-400 * t))   # soft attack
        sig[at:at + size] += np.sin(2 * np.pi * freq * t) * env * amp

    for b in range(beats):
        base = b * SR
        thump(base, 52, 1.0, 13)                       # lub
        thump(base + int(0.30 * SR), 44, 0.72, 15)     # dub

    sig = fast_lowpass(sig, 320)
    # A whisper of body noise underneath, or it sounds like a machine.
    sig += fast_lowpass(pink(n), 500) * 0.04
    return normalise(sig, 0.7)


def musicbox():
    """
    An original pentatonic figure in the timbre of a wind-up music box.
    Pentatonic because it has no leading tone, so nothing in it feels
    unresolved enough to hold a child's attention.
    """
    bpm = 62
    beat = 60 / bpm
    # C-major pentatonic across two octaves, as semitone offsets from C4.
    scale = {'C4': 0, 'D4': 2, 'E4': 4, 'G4': 7, 'A4': 9,
             'C5': 12, 'D5': 14, 'E5': 16, 'G5': 19, 'A5': 21}

    phrase = [
        ('E5', 1), ('C5', 1), ('D5', 1), ('G4', 1),
        ('A4', 1), ('C5', 1), ('E5', 2),
        ('D5', 1), ('C5', 1), ('A4', 1), ('G4', 1),
        ('E4', 2), ('G4', 2),
        ('C5', 1), ('E5', 1), ('G5', 1), ('E5', 1),
        ('D5', 1), ('C5', 1), ('A4', 2),
        ('G4', 1), ('A4', 1), ('C5', 1), ('D5', 1),
        ('C5', 4),
    ]

    total_beats = sum(d for _, d in phrase)
    n = int(total_beats * beat * SR)
    sig = np.zeros(n + SR)   # headroom for the last note's tail

    def note(at, semitone, amp=0.5):
        freq = 261.63 * 2 ** (semitone / 12)
        length = int(2.2 * SR)
        if at + length > len(sig):
            length = len(sig) - at
        t = np.arange(length) / SR
        env = np.exp(-3.4 * t) * (1 - np.exp(-900 * t))
        # Struck-metal timbre: a few inharmonic partials over the fundamental.
        voice = (np.sin(2 * np.pi * freq * t)
                 + 0.42 * np.sin(2 * np.pi * freq * 2.01 * t)
                 + 0.20 * np.sin(2 * np.pi * freq * 3.04 * t)
                 + 0.08 * np.sin(2 * np.pi * freq * 5.11 * t))
        sig[at:at + length] += voice * env * amp

    cursor = 0.0
    for name, beats in phrase:
        at = int(cursor * beat * SR)
        note(at, scale[name])
        # A soft root underneath every other bar, for warmth.
        if int(cursor) % 4 == 0:
            note(at, scale[name] - 12, amp=0.18)
        cursor += beats

    # Fold the decay tail back over the start so the loop is seamless.
    tail = sig[n:]
    sig = sig[:n]
    sig[:len(tail)] += tail
    return normalise(sig, 0.6)


def write(name, samples):
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / f'{name}.wav'
    mp3 = OUT / f'{name}.mp3'

    pcm = np.clip(samples, -1, 1)
    with wave.open(str(wav), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((pcm * 32767).astype('<i2').tobytes())

    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav),
         '-codec:a', 'libmp3lame', '-b:a', '80k', '-ar', '44100', '-ac', '1',
         str(mp3)],
        check=True,
    )
    wav.unlink()

    WEB_OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(mp3, WEB_OUT / mp3.name)

    print(f'  {mp3.name:20} {mp3.stat().st_size / 1024:6.0f} KB  '
          f'{len(samples) / SR:5.1f}s')


def main():
    print('Generating lullabies:')
    for name, fn in [('white-noise', white_noise), ('rain', rain),
                     ('heartbeat', heartbeat), ('musicbox', musicbox)]:
        write(name, fn())
    print(f'\nWritten to {OUT}')
    print(f'Copied to  {WEB_OUT}')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(f'ffmpeg failed: {exc}')
