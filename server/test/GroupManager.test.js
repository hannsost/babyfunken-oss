import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import GroupManager, { publicDevice } from '../lib/GroupManager.js';
import { CODE_LENGTH, MAX_DEVICES_PER_GROUP, isValidGroupCode } from '@babyfunken/shared/constants';

/** A GroupManager whose clock we control, so TTL logic is testable. */
function fixture() {
  let now = 1_000_000;
  const gm = new GroupManager({ now: () => now });
  return { gm, advance: (ms) => { now += ms; }, at: () => now };
}

describe('createGroup', () => {
  test('issues a well-formed code, a secret and a device token', () => {
    const { gm } = fixture();
    const { groupId, secret, deviceToken } = gm.createGroup('sock-1', 'Papas Handy');

    assert.equal(groupId.length, CODE_LENGTH);
    assert.ok(isValidGroupCode(groupId), `${groupId} should be a valid code`);
    assert.ok(secret.length >= 24);
    assert.ok(deviceToken.length >= 24);
    assert.notEqual(secret, deviceToken);
  });

  test('never collides across many creations', () => {
    const { gm } = fixture();
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(gm.createGroup(`s${i}`, 'x').groupId);
    assert.equal(seen.size, 2000);
  });
});

describe('joinGroup', () => {
  test('accepts the correct secret inside the pairing window', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');

    const res = gm.joinGroup('guest', { groupId, secret, displayName: 'Mamas Handy' });
    assert.equal(res.ok, true);
    assert.equal(res.devices.length, 2);
    assert.ok(res.deviceToken);
  });

  test('rejects a wrong secret', () => {
    const { gm } = fixture();
    const { groupId } = gm.createGroup('owner', 'Kamera');

    const res = gm.joinGroup('attacker', { groupId, secret: 'wrong', displayName: 'x' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'group_not_found');
  });

  test('reports a bad secret and an unknown group identically', () => {
    const { gm } = fixture();
    const { groupId } = gm.createGroup('owner', 'Kamera');

    const badSecret = gm.joinGroup('a', { groupId, secret: 'wrong', displayName: 'x' });
    const noGroup   = gm.joinGroup('b', { groupId: 'ZZZZZZZZ', secret: 'wrong', displayName: 'x' });
    assert.deepEqual(badSecret, noGroup);   // no oracle for code enumeration
  });

  test('rejects the right secret once the pairing window has closed', () => {
    const { gm, advance } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');

    advance(11 * 60 * 1000);
    const res = gm.joinGroup('guest', { groupId, secret, displayName: 'x' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'pairing_closed');
  });

  test('lets a known device back in after the window closed', () => {
    const { gm, advance } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    const first = gm.joinGroup('guest', { groupId, secret, displayName: 'Mamas Handy' });
    gm.leaveGroup('guest');

    advance(11 * 60 * 1000);
    const again = gm.joinGroup('guest-2', { groupId, deviceToken: first.deviceToken });
    assert.equal(again.ok, true);
    assert.equal(again.device.displayName, 'Mamas Handy');
  });

  test('restores the previous role on token rejoin', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    const joined = gm.joinGroup('cam', { groupId, secret, displayName: 'Altes Handy' });
    gm.setRole('cam', 'server');
    gm.leaveGroup('cam');

    const again = gm.joinGroup('cam-2', { groupId, deviceToken: joined.deviceToken });
    assert.equal(again.device.role, 'server');
  });

  test('enforces the device cap', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    for (let i = 1; i < MAX_DEVICES_PER_GROUP; i++) {
      assert.equal(gm.joinGroup(`d${i}`, { groupId, secret, displayName: `d${i}` }).ok, true);
    }
    const overflow = gm.joinGroup('one-too-many', { groupId, secret, displayName: 'x' });
    assert.equal(overflow.ok, false);
    assert.equal(overflow.code, 'group_full');
  });

  test('is idempotent for a socket already in the group', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    gm.joinGroup('guest', { groupId, secret, displayName: 'Mamas Handy' });

    const again = gm.joinGroup('guest', { groupId, secret, displayName: 'Mamas Handy' });
    assert.equal(again.ok, true);
    assert.equal(gm.devicesOf(groupId).length, 2);
  });
});

describe('pairing window', () => {
  test('can be reopened by a member', () => {
    const { gm, advance } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    advance(11 * 60 * 1000);
    assert.equal(gm.pairingState(groupId).open, false);

    gm.openPairing('owner');
    assert.equal(gm.pairingState(groupId).open, true);
    assert.equal(gm.joinGroup('guest', { groupId, secret, displayName: 'x' }).ok, true);
  });

  test('can be closed early', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    gm.closePairing('owner');

    const res = gm.joinGroup('guest', { groupId, secret, displayName: 'x' });
    assert.equal(res.code, 'pairing_closed');
  });

  test('cannot be opened by a socket outside the group', () => {
    const { gm } = fixture();
    gm.createGroup('owner', 'Kamera');
    assert.equal(gm.openPairing('stranger'), null);
  });
});

describe('isolation between groups', () => {
  test('sameGroup is true only within one group', () => {
    const { gm } = fixture();
    const a = gm.createGroup('a-owner', 'A');
    gm.createGroup('b-owner', 'B');
    gm.joinGroup('a-guest', { groupId: a.groupId, secret: a.secret, displayName: 'g' });

    assert.equal(gm.sameGroup('a-owner', 'a-guest'), true);
    assert.equal(gm.sameGroup('a-owner', 'b-owner'), false);
    assert.equal(gm.sameGroup('a-owner', 'nobody'), false);
  });
});

describe('publicDevice', () => {
  test('strips the device token before broadcast', () => {
    const { gm } = fixture();
    const { device } = gm.createGroup('owner', 'Kamera');
    assert.ok(device.token);
    assert.equal('token' in publicDevice(device), false);
    assert.equal(publicDevice(device).displayName, 'Kamera');
  });
});

describe('leaveGroup', () => {
  test('removes the device and reports the group', () => {
    const { gm } = fixture();
    const { groupId, secret } = gm.createGroup('owner', 'Kamera');
    gm.joinGroup('guest', { groupId, secret, displayName: 'g' });

    const left = gm.leaveGroup('guest');
    assert.equal(left.groupId, groupId);
    assert.equal(gm.devicesOf(groupId).length, 1);
    assert.equal(gm.getEntry('guest'), null);
  });

  test('is a no-op for an unknown socket', () => {
    const { gm } = fixture();
    assert.equal(gm.leaveGroup('ghost'), null);
  });
});
