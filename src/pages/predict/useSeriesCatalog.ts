import { useMemo, useState } from 'react';
import { supabase } from '@/db/supabase';
import { captureError } from '@/lib/analytics';
import { deriveSeriesPhase, isSeriesPending } from '@/lib/series-phase';
// The projection is shared with Home's pending-Game-7 read (Story 2.7, D2).
import { SERIES_SELECT } from '@/lib/series-query';
import type { Series, Team } from '@/types/types';
import { asSeries } from './types';

/**
 * The picker's series catalog: the whole archive, read once per URL arrival
 * (the arrival effect calls `fetchAllGames`), plus the team-row index the
 * custom matchup resolves typed names through. No effects of its own — the
 * controller decides when the fetch runs.
 */
export function useSeriesCatalog() {
  const [games, setGames] = useState<Series[]>([]);
  // Mount-time series list query failure (retryable).
  const [seriesListFailed, setSeriesListFailed] = useState(false);
  // The Active group's empty state is a claim about the whole archive, so it
  // may only render once the archive has actually answered — before that the
  // honest state is "unknown", not "nothing is pending".
  const [seriesListLoaded, setSeriesListLoaded] = useState(false);

  const fetchAllGames = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .order('year', { ascending: false });

      if (error) throw error;
      // Story 2.2 Decision 5: a row that reconciles to neither derived shape
      // is excluded from both picker groups and reported through the same
      // exception channel a fetch failure uses — never guessed into a group.
      const rows = asSeries(data);
      const reconciled: Series[] = [];
      for (const row of rows) {
        if (deriveSeriesPhase(row) === null) {
          const anomaly = new Error(`Series ${row.id} does not reconcile to a derived phase`);
          console.error('Non-reconciling series:', anomaly);
          captureError(anomaly);
        } else {
          reconciled.push(row);
        }
      }
      setGames(reconciled);
      setSeriesListLoaded(true);
      setSeriesListFailed(false);
    } catch (err) {
      // Story 1.3: the picker explains itself instead of failing silently to
      // an empty list. Only failure state changes here — selections survive.
      console.error('Error fetching series:', err);
      setSeriesListFailed(true);
      captureError(err);
    }
  };

  // Story 1.3: Retry re-runs the mount fetch.
  const retrySeriesList = () => {
    setSeriesListFailed(false);
    void fetchAllGames();
  };

  // Story 2.11 (owner decision U15): the custom-matchup form has no series FK,
  // but the app holds every team row anyway — `fetchAllGames` above loads the
  // whole archive through `SERIES_SELECT` (`src/lib/series-query.ts`), which
  // embeds `abbreviation` on both sides, so a typed name that the database spells
  // exactly this way prints that row's stored code instead of a bare initialism
  // (`Boston Celtics` → `BOS`, not `BC`). Lower-cased `full_name` → row, first
  // hit wins, and only rows with a non-empty `abbreviation` are indexed.
  // Owner decision U16 (2026-10-05) adds the logo alias table behind the row:
  // a typed name the rows do not spell exactly (`Jazz`, `UtahJazz`, `Sixers`)
  // prints the code of the team whose logo it shows, through `getTypedTeamCode`
  // — one matching rule for the logo and the code on this form. A name no alias
  // knows (`Utah J` mid-typing, `Nowhere FC`) still falls to the name path.
  const teamRowByName = useMemo(() => {
    const index = new Map<string, Team>();
    for (const game of games) {
      for (const row of [game.team_a, game.team_b]) {
        if (row?.full_name && row.abbreviation) {
          const key = row.full_name.toLowerCase();
          if (!index.has(key)) index.set(key, row);
        }
      }
    }
    return index;
  }, [games]);

  const rowFor = (name: string) => teamRowByName.get((name ?? '').trim().toLowerCase());

  // The picker's Active group is the derived pending set, newest first
  // (Story 2.2 / AD-4); `games` holds only rows that reconcile, so the
  // decade-card label and the group read the same derivation.
  const pendingGames = games.filter((game) => isSeriesPending(game)).sort((a, b) => b.year - a.year);

  return { games, pendingGames, seriesListFailed, seriesListLoaded, fetchAllGames, retrySeriesList, rowFor };
}

export type RowFor = ReturnType<typeof useSeriesCatalog>['rowFor'];
