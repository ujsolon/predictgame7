// `series.id` is a Postgres `uuid`. An id that is not UUID-shaped can never
// name a row, and sending it would make PostgREST answer a 400 (22P02) that
// the page would misread as a retryable failure — so a malformed id is "not
// found" without any query (Story 4.1).
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSeriesId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}
