import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, CODE_LENGTH,
  isValidGroupCode, normaliseGroupCode,
  buildPairingUrl, parsePairingUrl,
  QUALITY_PRESETS, LULLABIES,
} from '../constants.js';

describe('group codes', () => {
  test('accepts a code of the right shape', () => {
    assert.equal(isValidGroupCode('ABCDEFGH'), true);
    assert.equal(isValidGroupCode('23456789'), true);
  });

  test('rejects wrong lengths and ambiguous characters', () => {
    assert.equal(isValidGroupCode('ABCDEFG'), false);
    assert.equal(isValidGroupCode('ABCDEFGHI'), false);
    assert.equal(isValidGroupCode('ABCDEFG0'), false, '0 is excluded to avoid O/0 confusion');
    assert.equal(isValidGroupCode('ABCDEFGO'), false, 'O is excluded too');
    assert.equal(isValidGroupCode('ABCDEFG1'), false);
    assert.equal(isValidGroupCode('abcdefgh'), false, 'codes are upper case');
  });

  test('rejects non-strings', () => {
    for (const value of [null, undefined, 12345678, {}, []]) {
      assert.equal(isValidGroupCode(value), false);
    }
  });

  test('the alphabet excludes every look-alike character', () => {
    for (const char of ['0', 'O', '1', 'I', 'l']) {
      assert.equal(CODE_ALPHABET.includes(char), false, `${char} should not be in the alphabet`);
    }
    assert.equal(CODE_ALPHABET.length, 32);
  });
});

describe('normaliseGroupCode', () => {
  test('upper-cases and strips punctuation', () => {
    assert.equal(normaliseGroupCode('abcd-efgh'), 'ABCDEFGH');
    assert.equal(normaliseGroupCode('  ab cd ef gh '), 'ABCDEFGH');
  });

  test('truncates to the code length', () => {
    assert.equal(normaliseGroupCode('ABCDEFGHIJKL').length, CODE_LENGTH);
  });

  test('survives rubbish input', () => {
    assert.equal(normaliseGroupCode(null), '');
    assert.equal(normaliseGroupCode(42), '');
    assert.equal(normaliseGroupCode('!!!'), '');
  });
});

describe('pairing links', () => {
  test('round-trips a code and secret', () => {
    const url = buildPairingUrl('ABCDEFGH', 'a-secret+with/chars=');
    const parsed = parsePairingUrl(url);
    assert.deepEqual(parsed, { groupId: 'ABCDEFGH', secret: 'a-secret+with/chars=' });
  });

  test('rejects links that are not pairing links', () => {
    for (const url of [
      'https://example.com/?g=ABCDEFGH&s=x',
      'babyfunken://other?g=ABCDEFGH&s=x',
      'babyfunken://join?g=ABCDEFGH',
      'babyfunken://join?s=secret',
      'not a url',
      null,
      undefined,
    ]) {
      assert.equal(parsePairingUrl(url), null, `${url} should not parse`);
    }
  });

  test('rejects a link whose code is malformed', () => {
    assert.equal(parsePairingUrl('babyfunken://join?g=SHORT&s=secret'), null);
  });
});

describe('quality presets', () => {
  test('every preset is a sane capture configuration', () => {
    for (const [name, preset] of Object.entries(QUALITY_PRESETS)) {
      assert.ok(preset.width > 0 && preset.height > 0, `${name} has dimensions`);
      assert.ok(preset.frameRate >= 10, `${name} is at least 10 fps`);
      assert.ok(preset.width / preset.height > 1, `${name} is landscape`);
    }
  });

  test('presets are ordered from cheapest to most expensive', () => {
    const pixels = p => p.width * p.height * p.frameRate;
    assert.ok(pixels(QUALITY_PRESETS.low) < pixels(QUALITY_PRESETS.balanced));
    assert.ok(pixels(QUALITY_PRESETS.balanced) < pixels(QUALITY_PRESETS.high));
  });
});

describe('lullabies', () => {
  test('every entry has a unique id and a title', () => {
    const ids = LULLABIES.map(l => l.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of LULLABIES) {
      assert.ok(item.title.length > 0);
      assert.match(item.id, /^[a-z-]+$/, 'ids double as filenames');
    }
  });
});
