/** Frontend door to the one prediction contract (AD-2). Type-only: none of this reaches the bundle. */
import type { PredictionInput } from '../../supabase/functions/_shared/contract';

export type {
  ConfidenceLevel,
  ContributingFactor,
  MethodSlug,
  PredictionInput,
  PredictionResult,
  SharePayload,
  ShareScores,
} from '../../supabase/functions/_shared/contract';

/** The six games a prediction is computed from. */
export type GameNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** One of the twelve score fields of `PredictionInput`, spelled once (Story 4.4, D3). */
export type ScoreKey = `game_${GameNumber}_score_${'a' | 'b'}`;

/** The twelve scores, keyed and complete — what a request carries. */
export type ScoreFields = Pick<PredictionInput, ScoreKey>;

/**
 * The custom-matchup form as the page holds it (Story 4.4, D3): derived from
 * the request type, with both names as typed text and every score optional —
 * a blank field is `undefined`, never a cast. `buildCustomRequest` is the only
 * way from this shape to a `PredictionInput`.
 */
export type PredictionForm = Pick<PredictionInput, 'team_a' | 'team_b'> & Partial<ScoreFields>;
