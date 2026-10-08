/**
 * Pure failure classifier for the Predict flow (Story 1.3 / FR-8).
 *
 * Turns anything `supabase.functions.invoke('predict-game-7', ...)` can
 * return into a named failure class:
 *
 * - a `FunctionsHttpError` whose `Response` context carries the Edge
 *   Function's `{ "error": string }` envelope (the 400/500 rows) — the
 *   server's own string is surfaced, never raw JSON;
 * - a transport failure (`FunctionsFetchError` — whose `context` is **not**
 *   a `Response`, a relay error, or anything without a readable body) —
 *   service-unreachable copy, distinct from the rows above. The body is
 *   only read through a guarded `typeof context.text === 'function'` check;
 * - a non-conforming success: `200` with `win_probability_a: null` (the
 *   function's NaN math), a body that is not a `PredictionResult`, or the
 *   both-`data`-and-`error`-nullish pair — all caught by the runtime shape
 *   check below, because the compiler cannot see the wire.
 *
 * No React, no toast, no state: the page renders each class, and every
 * falsifiable decision lives here so it can be unit-tested.
 */
import { isMethodSlug } from '@/lib/method-display';
import type { ConfidenceLevel, PredictionResult } from '@/types/prediction';

export type ServiceFailureReason = 'server' | 'transport' | 'invalid-response';

/**
 * The one failure class the invoke classifier produces. Invalid custom input
 * is not a class here: it never reaches the wire, and the page renders it as
 * `validateCustomMatchup`'s field map (the dead `invalid-input` arm was
 * deleted by Story 4.4, D3).
 */
export type ServiceFailure = { kind: 'service'; reason: ServiceFailureReason; message: string; status?: number };

/**
 * Copy per service class. Names what failed and happens next (the panel's
 * Retry), never blames the user or the network (EXPERIENCE.md · Voice and
 * Tone). The `server` class is the function's own envelope string, so it
 * has no constant here.
 */
export const SERVICE_MESSAGES = {
  transport: "Couldn't reach the prediction service. It may be briefly unavailable.",
  emptyBody: 'The prediction service returned no result.',
  unreadable: 'The prediction service returned an unreadable result.',
} as const;

// The method domain comes from `isMethodSlug`, an own-key check over
// `METHOD_LABELS` — `Record<MethodSlug, string>`, exhaustive by construction
// (AD-2) — so a contract slug rename fails the typecheck there instead of
// silently rejecting every healthy response here. Own keys only: an inherited
// name such as `toString` is not a method (deferred 4.1 row B10).
// Confidence has no such map in the frontend, so it is typed against the union.
const CONFIDENCE_LEVELS: Record<ConfidenceLevel, true> = { High: true, Medium: true, Low: true };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Runtime shape check for a `200` body before `setResult` accepts it — the
 * boundary the silent-`200` paths (e.g. `win_probability_a: null` from NaN
 * math in the function) currently sail through.
 */
export function isPredictionResult(value: unknown): value is PredictionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.predicted_winner !== 'string') return false;
  if (typeof result.team_a !== 'string' || typeof result.team_b !== 'string') return false;
  if (!isFiniteNumber(result.win_probability_a) || !isFiniteNumber(result.win_probability_b)) return false;
  if (typeof result.confidence_level !== 'string' || !(result.confidence_level in CONFIDENCE_LEVELS)) return false;
  if (!isFiniteNumber(result.computation_time_ms)) return false;
  if (typeof result.method_used !== 'string' || !isMethodSlug(result.method_used)) return false;
  if (!Array.isArray(result.contributing_factors)) return false;
  for (const factor of result.contributing_factors) {
    if (!factor || typeof factor !== 'object') return false;
    const entry = factor as Record<string, unknown>;
    if (typeof entry.factor !== 'string') return false;
    if (typeof entry.description !== 'string') return false;
    if (!isFiniteNumber(entry.impact)) return false;
  }
  return true;
}

/** Parses the Edge Function's `{ "error": string }` envelope; null for any other body. */
export function parseErrorEnvelope(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const message = (parsed as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim() !== '') return message;
    }
  } catch {
    // Body wasn't JSON at all — not the envelope.
  }
  return null;
}

interface ResponseLike {
  status?: unknown;
  text?: () => Promise<string>;
}

/**
 * `FunctionsError.context` is the raw `Response` for HTTP/relay errors but
 * NOT for fetch errors — this is the only place that shape is trusted, and
 * `text()` is never awaited unguarded (the `PredictPage.tsx:243` bug).
 */
function asResponseLike(context: unknown): ResponseLike | null {
  if (!context || typeof context !== 'object') return null;
  const candidate = context as ResponseLike;
  if (typeof candidate.text !== 'function') return null;
  return candidate;
}

function statusOf(response: ResponseLike): number | undefined {
  return typeof response.status === 'number' ? response.status : undefined;
}

function serviceFailure(
  reason: ServiceFailureReason,
  message: string,
  status?: number
): ServiceFailure {
  return { kind: 'service', reason, message, status };
}

/** Classifies the `error` half of an invoke result into a service failure. */
export async function classifyInvokeError(error: unknown): Promise<ServiceFailure> {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  const response = asResponseLike((error as { context?: unknown } | null | undefined)?.context);

  // Transport (offline/DNS drop) and relay failures never reached the
  // function — service-unreachable copy, distinct from the server rows.
  // An unrecognized error without a readable body is treated the same way.
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError' || !response) {
    return serviceFailure('transport', SERVICE_MESSAGES.transport);
  }

  let body: string | null = null;
  try {
    body = await response.text!();
  } catch {
    body = null;
  }

  const envelope = body !== null ? parseErrorEnvelope(body) : null;
  if (envelope) {
    // The function's own `{error}` string — e.g. the 400 "Team names are
    // required" or a 500 message — is the panel line, not the JSON.
    return serviceFailure('server', envelope, statusOf(response));
  }
  // A non-2xx body that is not the envelope: still the service class, with
  // copy naming the prediction service rather than the network.
  return serviceFailure('invalid-response', SERVICE_MESSAGES.unreadable, statusOf(response));
}

/**
 * The raw `invoke` body as a value. A `200` arrives as a string when the
 * response is `text/plain`, so this is the one place that shape is decoded —
 * the classifier checks it and the page renders the same parsed copy.
 */
export function parseInvokeBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * One entry point over the raw `{ data, error }` pair from
 * `supabase.functions.invoke`. Returns null only for a conforming
 * `PredictionResult` body and no error.
 */
export async function classifyInvokeResult(
  error: unknown,
  data: unknown
): Promise<ServiceFailure | null> {
  if (error != null) return classifyInvokeError(error);
  if (data == null) {
    // Both data and error nullish — the silent stop today must say something.
    return serviceFailure('invalid-response', SERVICE_MESSAGES.emptyBody);
  }

  const value = parseInvokeBody(data);
  if (!isPredictionResult(value)) {
    // e.g. the 200 with win_probability_a: null — never render `undefined%`.
    return serviceFailure('invalid-response', SERVICE_MESSAGES.unreadable);
  }
  return null;
}
