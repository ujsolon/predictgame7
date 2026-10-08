/**
 * The `?custom=` share-link codec (AD-6, Story 4.4) — the one encoder and the
 * one decoder for the `SharePayload` schema in `_shared/contract.ts` (AD-2).
 *
 * Encoding: JSON, then UTF-8, then URL-safe base64 (`-` and `_`, no `=`
 * padding), so the value goes into a query string as-is and a non-ASCII team
 * name ("Montréal") round-trips exactly.
 *
 * Decoding never throws: anything that is not a version-1 payload whose
 * names, twelve scores and method pass the custom form's own rules
 * (`validateCustomMatchup`, plus `isMethodSlug`) is `null`.
 *
 * Pure and SSR-safe: `btoa`/`atob`/`TextEncoder`/`TextDecoder` are globals in
 * both the browser and Node, and nothing here touches `window`.
 */
import { completeScores, SCORE_KEYS, validateCustomMatchup } from '@/lib/custom-matchup';
import { isMethodSlug } from '@/lib/method-display';
import type { MethodSlug, PredictionForm, ScoreFields, SharePayload, ShareScores } from '@/types/prediction';

/** A generous ceiling on the encoded length; a real payload is a few hundred characters. */
const MAX_ENCODED_LENGTH = 4096;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  // Unpadded base64 is never 1 mod 4 long; anything outside the URL-safe
  // alphabet (including `=`, `+`, `/`) is not this encoding.
  if (text.length === 0 || text.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a payload for `?custom=`. */
export function encodeSharePayload(payload: SharePayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/** The custom form a payload prefills (names as sent, the twelve scores in grid order). */
export function formFromSharePayload(payload: SharePayload): PredictionForm {
  const form: PredictionForm = { team_a: payload.team_a, team_b: payload.team_b };
  SCORE_KEYS.forEach((key, index) => {
    form[key] = payload.scores[index];
  });
  return form;
}

/**
 * The payload for a custom matchup the page holds, or null when the form
 * would not pass its own validation (so an unrunnable matchup is never shared).
 * Names are trimmed, as the request trims them.
 */
export function sharePayloadFromForm(form: PredictionForm, method: MethodSlug): SharePayload | null {
  if (Object.keys(validateCustomMatchup(form)).length > 0) return null;
  const complete = completeScores(form);
  if (!complete) return null;
  return {
    v: 1,
    team_a: form.team_a.trim(),
    team_b: form.team_b.trim(),
    scores: toShareScores(complete),
    method,
  };
}

function toShareScores(scores: ScoreFields): ShareScores {
  return [
    scores.game_1_score_a,
    scores.game_1_score_b,
    scores.game_2_score_a,
    scores.game_2_score_b,
    scores.game_3_score_a,
    scores.game_3_score_b,
    scores.game_4_score_a,
    scores.game_4_score_b,
    scores.game_5_score_a,
    scores.game_5_score_b,
    scores.game_6_score_a,
    scores.game_6_score_b,
  ];
}

/** Decodes `?custom=`; null for anything malformed. Never throws. */
export function decodeSharePayload(encoded: string | null | undefined): SharePayload | null {
  if (typeof encoded !== 'string' || encoded.length > MAX_ENCODED_LENGTH) return null;
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (raw.v !== 1) return null;
  if (typeof raw.team_a !== 'string' || typeof raw.team_b !== 'string') return null;
  if (typeof raw.method !== 'string' || !isMethodSlug(raw.method)) return null;
  const scores = raw.scores;
  if (!Array.isArray(scores) || scores.length !== SCORE_KEYS.length) return null;
  // The form's rules accept a numeric string; a payload does not.
  if (!scores.every((score) => typeof score === 'number' && Number.isFinite(score))) return null;

  const form: PredictionForm = { team_a: raw.team_a, team_b: raw.team_b };
  SCORE_KEYS.forEach((key, index) => {
    form[key] = scores[index] as number;
  });
  return sharePayloadFromForm(form, raw.method);
}
