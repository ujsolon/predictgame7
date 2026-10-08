import { describe, expect, it } from 'vitest';

import {
  decodeSharePayload,
  encodeSharePayload,
  formFromSharePayload,
  sharePayloadFromForm,
} from '@/lib/share-payload';
import type { SharePayload } from '@/types/prediction';

// Story 4.4 · the `?custom=` codec: JSON → UTF-8 → URL-safe base64, no padding.
const payload: SharePayload = {
  v: 1,
  team_a: 'Boston Celtics',
  team_b: 'Miami Heat',
  scores: [101, 91, 92, 102, 103, 93, 94, 104, 105, 95, 96, 106],
  method: 'elo',
};

/** Encodes an arbitrary value exactly as the encoder would, to forge malformed payloads. */
function forge(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('share payload codec (Story 4.4)', () => {
  it('round-trips a payload exactly', () => {
    const encoded = encodeSharePayload(payload);
    expect(decodeSharePayload(encoded)).toEqual(payload);
  });

  it('emits only URL-safe characters with no padding, so it goes into a query as-is', () => {
    // Long enough names to exercise every base64 tail length.
    for (const name of ['A', 'AB', 'ABC', 'ABCD', 'Ünïcødé ✓ ?&=/+']) {
      const encoded = encodeSharePayload({ ...payload, team_a: name });
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(encoded)).toBe(encoded);
      expect(decodeSharePayload(encoded)?.team_a).toBe(name);
    }
  });

  it('round-trips a non-ASCII name exactly (matrix: Montréal)', () => {
    const montreal = { ...payload, team_a: 'Montréal', team_b: 'São Paulo 🏀' };
    const decoded = decodeSharePayload(encodeSharePayload(montreal));
    expect(decoded).toEqual(montreal);
    expect(decoded?.team_a).toBe('Montréal');
  });

  it('round-trips every method slug', () => {
    for (const method of ['logistic_regression', 'bayes', 'elo', 'exponential_smoothing'] as const) {
      expect(decodeSharePayload(encodeSharePayload({ ...payload, method }))?.method).toBe(method);
    }
  });

  it('turns a payload into the form it prefills, scores in grid order', () => {
    expect(formFromSharePayload(payload)).toEqual({
      team_a: 'Boston Celtics',
      team_b: 'Miami Heat',
      game_1_score_a: 101,
      game_1_score_b: 91,
      game_2_score_a: 92,
      game_2_score_b: 102,
      game_3_score_a: 103,
      game_3_score_b: 93,
      game_4_score_a: 94,
      game_4_score_b: 104,
      game_5_score_a: 105,
      game_5_score_b: 95,
      game_6_score_a: 96,
      game_6_score_b: 106,
    });
  });

  it('builds a payload from a valid form, trimming the names as the request does', () => {
    const form = { ...formFromSharePayload(payload), team_a: '  Boston Celtics ' };
    expect(sharePayloadFromForm(form, 'elo')).toEqual(payload);
  });

  it('refuses to build a payload from a form that would not pass its own validation', () => {
    expect(sharePayloadFromForm({ ...formFromSharePayload(payload), game_3_score_b: undefined }, 'elo')).toBeNull();
    expect(sharePayloadFromForm({ ...formFromSharePayload(payload), team_b: '  ' }, 'elo')).toBeNull();
  });
});

describe('share payload decoder — every malformed form is null, never a throw (Story 4.4)', () => {
  const cases: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['the matrix "abc"', 'abc'],
    ['a length that is 1 mod 4', 'abcde'],
    ['standard base64 alphabet (+ and /)', '+/+/'],
    ['padding', `${forge(payload)}=`],
    ['spaces', 'ey J2'],
    ['not JSON', btoa('not json').replace(/=+$/, '')],
    ['invalid UTF-8 bytes', btoa(String.fromCharCode(0xc3, 0x28)).replace(/=+$/, '')],
    ['an over-long value', 'A'.repeat(5000)],
    ['a JSON array', forge([1, 2, 3])],
    ['a JSON string', forge('hello')],
    ['JSON null', forge(null)],
    ['a missing version', forge({ ...payload, v: undefined })],
    ['version 2', forge({ ...payload, v: 2 })],
    ['version "1"', forge({ ...payload, v: '1' })],
    ['a missing team name', forge({ ...payload, team_b: undefined })],
    ['a numeric team name', forge({ ...payload, team_a: 42 })],
    ['a blank team name', forge({ ...payload, team_a: '   ' })],
    ['eleven scores', forge({ ...payload, scores: payload.scores.slice(0, 11) })],
    ['thirteen scores', forge({ ...payload, scores: [...payload.scores, 100] })],
    ['scores as an object', forge({ ...payload, scores: { 0: 101 } })],
    ['a string score', forge({ ...payload, scores: ['101', ...payload.scores.slice(1)] })],
    ['a null score', forge({ ...payload, scores: [null, ...payload.scores.slice(1)] })],
    ['a zero score (counts as missing)', forge({ ...payload, scores: [0, ...payload.scores.slice(1)] })],
    ['a negative score', forge({ ...payload, scores: [-5, ...payload.scores.slice(1)] })],
    ['a decimal score', forge({ ...payload, scores: [99.5, ...payload.scores.slice(1)] })],
    ['an unknown method', forge({ ...payload, method: 'bayesian' })],
    ['an inherited-property method', forge({ ...payload, method: 'toString' })],
    ['a missing method', forge({ ...payload, method: undefined })],
  ];

  for (const [label, input] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => decodeSharePayload(input as string)).not.toThrow();
      expect(decodeSharePayload(input as string)).toBeNull();
    });
  }
});
