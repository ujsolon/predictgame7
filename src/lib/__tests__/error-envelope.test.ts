import { describe, expect, it } from 'vitest';

import { METHOD_LABELS } from '@/lib/method-display';
import {
  classifyInvokeResult,
  isPredictionResult,
  parseErrorEnvelope,
  parseInvokeBody,
  SERVICE_MESSAGES,
} from '@/lib/error-envelope';

// A body that conforms to supabase/functions/_shared/contract.ts as the
// Edge Function actually sends it (0-100 percentage probabilities).
const validResult = {
  predicted_winner: 'Boston Celtics',
  team_a: 'Boston Celtics',
  team_b: 'Miami Heat',
  win_probability_a: 61.25,
  win_probability_b: 38.75,
  confidence_level: 'High',
  contributing_factors: [
    { factor: 'Home form', description: 'Celtics won 4 of 6 at home.', impact: 0.12 },
  ],
  computation_time_ms: 8,
  method_used: 'bayes',
};

// Mirrors @supabase/functions-js: all three error classes extend
// FunctionsError { name, message, context }; context is the raw Response
// EXCEPT for fetch errors. Constructed by name/shape so the test (and the
// classifier) never depends on the transitive package import.
const httpError = (status: number, body: string) =>
  Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  });

const fetchError = () =>
  Object.assign(new Error('Failed to send a request to the Edge Function'), {
    name: 'FunctionsFetchError',
    // The shape that breaks the old `await error?.context?.text()` call:
    // a fetch error's context is NOT a Response.
    context: new TypeError('Failed to fetch'),
  });

describe('classifyInvokeResult — conforming success', () => {
  it('returns null for a valid PredictionResult body', async () => {
    await expect(classifyInvokeResult(null, validResult)).resolves.toBeNull();
  });

  it('accepts a JSON string body that parses to a valid result', async () => {
    await expect(classifyInvokeResult(null, JSON.stringify(validResult))).resolves.toBeNull();
  });
});

describe('classifyInvokeResult — function rejects the request', () => {
  it('surfaces the server 400 envelope string, not raw JSON', async () => {
    const failure = await classifyInvokeResult(
      httpError(400, JSON.stringify({ error: 'Team names are required' })),
      null
    );
    expect(failure).toEqual({
      kind: 'service',
      reason: 'server',
      message: 'Team names are required',
      status: 400,
    });
  });

  it('surfaces the server 500 envelope string', async () => {
    const failure = await classifyInvokeResult(
      httpError(500, JSON.stringify({ error: 'Something broke' })),
      null
    );
    expect(failure?.kind === 'service' && failure.message).toBe('Something broke');
    expect(failure?.kind === 'service' && failure.status).toBe(500);
  });

  it('falls back to service copy when the error body is not the envelope', async () => {
    const failure = await classifyInvokeResult(httpError(502, '<html>Bad Gateway</html>'), null);
    expect(failure).toEqual({
      kind: 'service',
      reason: 'invalid-response',
      message: SERVICE_MESSAGES.unreadable,
      status: 502,
    });
    expect(failure?.kind === 'service' && failure.message).not.toContain('<html>');
  });

  it('treats a body stream whose text() rejects as unreadable, not as a crash', async () => {
    // A Response-like context whose text() rejects mid-read (broken stream):
    // the guarded `try` around `response.text()` must swallow it and fall to
    // the invalid-response class with the status preserved.
    const failure = await classifyInvokeResult(
      {
        name: 'FunctionsHttpError',
        message: 'HttpError',
        context: { status: 502, text: () => Promise.reject(new Error('stream broke')) },
      },
      null
    );
    expect(failure).toEqual({
      kind: 'service',
      reason: 'invalid-response',
      message: SERVICE_MESSAGES.unreadable,
      status: 502,
    });
  });
});

describe('classifyInvokeResult — transport failure', () => {
  it('classifies FunctionsFetchError without touching its non-Response context', async () => {
    // Must not throw trying to `await context.text()`.
    const failure = await classifyInvokeResult(fetchError(), null);
    expect(failure).toEqual({
      kind: 'service',
      reason: 'transport',
      message: SERVICE_MESSAGES.transport,
    });
  });

  it('classifies FunctionsRelayError as unreachable', async () => {
    const relay = Object.assign(new Error('Relay Error invoking the Edge Function'), {
      name: 'FunctionsRelayError',
      context: new Response('relay down', { status: 500 }),
    });
    const failure = await classifyInvokeResult(relay, null);
    expect(failure?.kind === 'service' && failure.reason).toBe('transport');
  });

  it('treats an unrecognized error without a readable body as transport', async () => {
    const failure = await classifyInvokeResult(new Error('boom'), null);
    expect(failure?.kind === 'service' && failure.reason).toBe('transport');
  });

  it('names the prediction service, never the network, in the non-2xx unreadable-body case', async () => {
    const failure = await classifyInvokeResult(httpError(503, 'plain text'), null);
    expect(failure?.kind === 'service' && failure.message).toContain('prediction service');
  });

  it('the transport copy differs from the other two service classes', async () => {
    const transport = await classifyInvokeResult(fetchError(), null);
    const server = await classifyInvokeResult(
      httpError(500, JSON.stringify({ error: 'Server said no' })),
      null
    );
    const malformed = await classifyInvokeResult(null, { ...validResult, win_probability_a: null });
    expect(transport?.kind === 'service' && transport.message).toBe(SERVICE_MESSAGES.transport);
    expect(server?.kind === 'service' && server.message).toBe('Server said no');
    expect(malformed?.kind === 'service' && malformed.message).toBe(SERVICE_MESSAGES.unreadable);
    expect(new Set([transport?.kind === 'service' && transport.message,
      server?.kind === 'service' && server.message,
      malformed?.kind === 'service' && malformed.message]).size).toBe(3);
  });
});

describe('classifyInvokeResult — non-conforming success', () => {
  it('catches the 200 with win_probability_a: null (the `undefined%` case)', async () => {
    const failure = await classifyInvokeResult(null, { ...validResult, win_probability_a: null });
    expect(failure).toEqual({
      kind: 'service',
      reason: 'invalid-response',
      message: SERVICE_MESSAGES.unreadable,
    });
  });

  it('catches a body that is not a PredictionResult', async () => {
    await expect(classifyInvokeResult(null, { hello: 'world' })).resolves.toMatchObject({
      kind: 'service',
      reason: 'invalid-response',
    });
    await expect(classifyInvokeResult(null, 'not json at all')).resolves.toMatchObject({
      kind: 'service',
      reason: 'invalid-response',
    });
  });

  it('says something when both data and error come back nullish', async () => {
    const failure = await classifyInvokeResult(null, null);
    expect(failure).toEqual({
      kind: 'service',
      reason: 'invalid-response',
      message: SERVICE_MESSAGES.emptyBody,
    });
  });

  it('prefers the error when both data and error are present', async () => {
    const failure = await classifyInvokeResult(httpError(500, '{"error":"nope"}'), validResult);
    expect(failure?.kind === 'service' && failure.message).toBe('nope');
  });
});

describe('parseInvokeBody', () => {
  it('decodes a string body once, for the classifier and the page alike', () => {
    expect(parseInvokeBody(validResult)).toBe(validResult);
    expect(parseInvokeBody(JSON.stringify(validResult))).toEqual(validResult);
    expect(parseInvokeBody('not json')).toBeNull();
  });
});

describe('isPredictionResult', () => {
  it('accepts the contract shape and rejects drift', () => {
    expect(isPredictionResult(validResult)).toBe(true);
    expect(isPredictionResult(null)).toBe(false);
    expect(isPredictionResult([])).toBe(false);
    expect(isPredictionResult({ ...validResult, method_used: 'bayesian' })).toBe(false);
    expect(isPredictionResult({ ...validResult, confidence_level: 'Certain' })).toBe(false);
    expect(isPredictionResult({ ...validResult, win_probability_b: Number.NaN })).toBe(false);
    expect(isPredictionResult({ ...validResult, contributing_factors: 'Home form' })).toBe(false);
    expect(
      isPredictionResult({
        ...validResult,
        contributing_factors: [{ factor: 'x', description: 'y', impact: '0.1' }],
      })
    ).toBe(false);
  });

  it('accepts every shipped method slug', () => {
    // `METHOD_LABELS` is the domain the shape check reads, so this is the
    // tripwire: a slug the classifier would reject for a healthy `200` fails
    // here instead of shipping as "unreadable result".
    for (const slug of Object.keys(METHOD_LABELS)) {
      expect(isPredictionResult({ ...validResult, method_used: slug })).toBe(true);
    }
  });
});

describe('parseErrorEnvelope', () => {
  it('extracts only a non-empty string error field', () => {
    expect(parseErrorEnvelope('{"error":"Team names are required"}')).toBe('Team names are required');
    expect(parseErrorEnvelope('{"error":"  "}')).toBeNull();
    expect(parseErrorEnvelope('{"error":42}')).toBeNull();
    expect(parseErrorEnvelope('{"message":"wrong envelope"}')).toBeNull();
    expect(parseErrorEnvelope('[{"error":"array"}]')).toBeNull();
    expect(parseErrorEnvelope('gateway html')).toBeNull();
  });
});
