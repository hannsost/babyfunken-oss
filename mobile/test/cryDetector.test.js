import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CryDetector, toDecibels } from '../src/lib/cryDetector.js';

/** A peer connection that reports a fixed audio level. */
function fakePeer(audioLevel, { state = 'connected', type = 'media-source' } = {}) {
  return {
    connectionState: state,
    async getStats() {
      return {
        forEach(fn) {
          fn({ type, kind: 'audio', audioLevel, remoteSource: false });
        },
      };
    },
  };
}

/**
 * Starts a detector but removes its interval, so the test drives ticks
 * itself. `_tick` deliberately no-ops unless the detector is running,
 * which is what stops an in-flight async tick from firing after stop().
 */
function arm(detector) {
  detector.start();
  clearInterval(detector._timer);
  detector._timer = null;
  return detector;
}

/** Drives a detector over a scripted timeline of levels. */
async function run(detector, clock, steps) {
  for (const { advance } of steps) {
    clock.value += advance;
    await detector._tick();
  }
}

function fixture({ sensitivity = -25, level = 0 } = {}) {
  const clock = { value: 1_000_000 };
  const peer = { current: fakePeer(level) };
  const cries = [];
  const detector = new CryDetector({
    getPeerConnections: () => [peer.current],
    sensitivity,
    onCry: () => cries.push(clock.value),
    now: () => clock.value,
  });
  return { detector: arm(detector), clock, peer, cries };
}

describe('toDecibels', () => {
  test('maps the linear WebRTC range onto dBFS', () => {
    assert.equal(toDecibels(1), 0);
    assert.ok(Math.abs(toDecibels(0.5) - -6.02) < 0.01);
    assert.ok(Math.abs(toDecibels(0.1) - -20) < 0.01);
  });

  test('treats silence and rubbish as the floor', () => {
    assert.equal(toDecibels(0), -100);
    assert.equal(toDecibels(null), -100);
    assert.equal(toDecibels(undefined), -100);
    assert.equal(toDecibels(-1), -100);
  });

  test('clamps levels above full scale', () => {
    assert.equal(toDecibels(2), 0);
  });
});

describe('cry detection', () => {
  test('does not fire on a short loud noise', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.5);   // −6 dBFS, well over the threshold

    await run(detector, clock, [{ advance: 250 }, { advance: 250 }]);
    assert.equal(cries.length, 0, 'a door closing should not wake the house');
  });

  test('fires once the noise is sustained past a second', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.5);

    await run(detector, clock, Array(6).fill({ advance: 250 }));
    assert.equal(cries.length, 1);
  });

  test('stays silent below the threshold however long it lasts', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.02);   // ≈ −34 dBFS

    await run(detector, clock, Array(20).fill({ advance: 250 }));
    assert.equal(cries.length, 0);
  });

  test('resets the timer when the noise stops', async () => {
    const { detector, clock, peer, cries } = fixture();

    peer.current = fakePeer(0.5);
    await run(detector, clock, [{ advance: 250 }, { advance: 250 }]);
    peer.current = fakePeer(0.001);
    await run(detector, clock, [{ advance: 250 }]);
    peer.current = fakePeer(0.5);
    await run(detector, clock, [{ advance: 250 }, { advance: 250 }]);

    assert.equal(cries.length, 0, 'the sustain window should have restarted');
  });

  test('holds a cooldown so one cry is not reported repeatedly', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.5);

    // 30 seconds of unbroken crying. Each alert costs one second of
    // sustain plus the eight second cooldown, so they land ~9s apart.
    await run(detector, clock, Array(120).fill({ advance: 250 }));

    assert.ok(cries.length >= 3, `expected repeat alerts, got ${cries.length}`);
    assert.ok(cries.length <= 4, `too many alerts for 30s: ${cries.length}`);

    for (let i = 1; i < cries.length; i++) {
      const gap = cries[i] - cries[i - 1];
      assert.ok(gap >= 8000, `alerts ${i - 1}→${i} were only ${gap}ms apart`);
    }
  });

  test('respects a changed sensitivity', async () => {
    const { detector, clock, peer, cries } = fixture({ sensitivity: -3 });
    peer.current = fakePeer(0.5);   // −6 dBFS: under the stricter threshold

    await run(detector, clock, Array(10).fill({ advance: 250 }));
    assert.equal(cries.length, 0);

    detector.setSensitivity(-25);
    await run(detector, clock, Array(6).fill({ advance: 250 }));
    assert.equal(cries.length, 1);
  });
});

describe('level sources', () => {
  test('ignores peers that are not connected', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.9, { state: 'connecting' });

    await run(detector, clock, Array(10).fill({ advance: 250 }));
    assert.equal(cries.length, 0);
  });

  test('reads the legacy `track` stat when that is all there is', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.5, { type: 'track' });

    await run(detector, clock, Array(6).fill({ advance: 250 }));
    assert.equal(cries.length, 1);
  });

  test('survives a peer whose getStats rejects', async () => {
    const clock = { value: 0 };
    const detector = arm(new CryDetector({
      getPeerConnections: () => [{
        connectionState: 'connected',
        getStats: () => Promise.reject(new Error('gone')),
      }],
      onCry: () => assert.fail('should not fire'),
      now: () => clock.value,
    }));

    await detector._tick();   // must not throw
  });

  test('reports the measured level to a meter callback', async () => {
    const clock = { value: 0 };
    const levels = [];
    const detector = arm(new CryDetector({
      getPeerConnections: () => [fakePeer(0.5)],
      onCry: () => {},
      onLevel: db => levels.push(db),
      now: () => clock.value,
    }));

    await detector._tick();
    assert.equal(levels.length, 1);
    assert.ok(Math.abs(levels[0] - -6.02) < 0.01);
  });
});

describe('lifecycle', () => {
  test('stop clears the sustain state', async () => {
    const { detector, clock, peer, cries } = fixture();
    peer.current = fakePeer(0.5);

    await run(detector, clock, [{ advance: 250 }, { advance: 250 }]);
    detector.stop();
    await run(detector, clock, [{ advance: 250 }, { advance: 250 }]);

    assert.equal(cries.length, 0, 'ticks after stop must not accumulate');
  });
});
