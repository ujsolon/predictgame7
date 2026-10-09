import { Button } from '@/components/ui/button';
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'react-router-dom';
import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';
import { getTeamCode } from '@/lib/nba-utils';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';
import type { Series } from '@/types/types';
import { ChevronRight, Settings } from 'lucide-react';

export type SelectionLevel = 'decades' | 'years' | 'series';

interface SeriesPickerProps {
  games: Series[];
  pendingGames: Series[];
  seriesListFailed: boolean;
  seriesListLoaded: boolean;
  onRetryList: () => void;
  selectionLevel: SelectionLevel;
  setSelectionLevel: (level: SelectionLevel) => void;
  selectedDecade: number | null;
  setSelectedDecade: (decade: number | null) => void;
  selectedYear: number | null;
  setSelectedYear: (year: number | null) => void;
  isCustomSelected: boolean;
  onSelectSeries: (game: Series) => void;
  onSelectCustom: () => void;
}

/** The series picker dialog's body: Active group, decades → years → series, and Custom Matchup. */
export default function SeriesPicker({
  games,
  pendingGames,
  seriesListFailed,
  seriesListLoaded,
  onRetryList,
  selectionLevel,
  setSelectionLevel,
  selectedDecade,
  setSelectedDecade,
  selectedYear,
  setSelectedYear,
  isCustomSelected,
  onSelectSeries,
  onSelectCustom,
}: SeriesPickerProps) {
  const renderSeriesOption = (game: Series) => {
    const teamAName = game.team_a?.full_name || 'Team A';
    const teamBName = game.team_b?.full_name || 'Team B';
    const teamALogo = resolveTeamLogoUrl(game.team_a?.logo_url) || getTeamLogo(teamAName);
    const teamBLogo = resolveTeamLogoUrl(game.team_b?.logo_url) || getTeamLogo(teamBName);

    return (
      <Button
        key={game.id}
        variant="outline"
        className="h-24 sm:h-20 flex flex-col gap-2 p-3 transition-all duration-200 hover:border-primary/50"
        onClick={() => onSelectSeries(game)}
      >
        <div className="flex items-center gap-2 w-full justify-center">
          <div className="flex -space-x-1.5 shrink-0">
            {teamALogo && (
              <img src={teamALogo} alt="" className="h-5 w-5 rounded-full border border-background bg-white p-0.5" />
            )}
            {teamBLogo && (
              <img src={teamBLogo} alt="" className="h-5 w-5 rounded-full border border-background bg-white p-0.5" />
            )}
          </div>
          <span className="text-xs font-bold truncate">
            {getTeamCode(teamAName, game.team_a)} vs {getTeamCode(teamBName, game.team_b)}
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-tighter opacity-60 font-medium truncate w-full text-center">
          {game.round}
        </span>
      </Button>
    );
  };

  return (
    <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] flex flex-col p-0 overflow-hidden">
      <DialogHeader className="p-6 pb-2">
        <DialogTitle>Select Series</DialogTitle>
        <DialogDescription>
          Choose a season to view its Game 7s, or create a custom series
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
        {seriesListFailed ? (
          // Story 1.3: the picker explains itself instead of
          // showing an empty list; Retry re-runs the mount fetch.
          <ErrorRetryPanel
            heading="Couldn't load the series list."
            message="Retry fetches the archive again. Your current selection stays put."
            onRetry={onRetryList}
          />
        ) : (
        <div className="space-y-4">
          {/* Story 2.2: Active-group membership is derived, never
              stored, and the group is always present at the decade
              level — with nothing pending it renders empty with
              EXPERIENCE.md:112's copy and the onward archive link,
              not hidden, not an error. The empty copy waits for the
              list to answer, because "nothing is pending" is a claim
              about the whole archive. `games` already excludes the
              non-reconciling rows (reported at fetch). */}
          {selectionLevel === 'decades' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Game 7s</p>
              {pendingGames.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pendingGames.map((game) => renderSeriesOption(game))}
                </div>
              ) : seriesListLoaded ? (
                <div className="space-y-1 px-1">
                  <p className="text-xs text-muted-foreground">No active series right now — the next Game 7 is coming.</p>
                  <Link to="/historical" className="inline-block text-xs font-medium text-primary hover:underline">
                    Every Game 7 has a history.
                  </Link>
                </div>
              ) : null}
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {selectionLevel === 'decades' ? 'Select Decade' :
             selectionLevel === 'years' ? `Select Year from ${selectedDecade}s` :
             `Select Series from ${selectedYear}`}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {selectionLevel === 'decades' && (
              [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950, 1940].map(decade => (
                <Button
                  key={decade}
                  variant="outline"
                  className="h-20 flex flex-col gap-1 transition-all duration-200 hover:border-primary/50"
                  onClick={() => {
                    setSelectedDecade(decade);
                    setSelectionLevel('years');
                  }}
                >
                  <span className="text-xl font-bold">{decade}s</span>
                  <span className="text-[10px] uppercase opacity-60">View Years</span>
                </Button>
              ))
            )}

            {selectionLevel === 'years' && (
              <>
                <Button
                  variant="ghost"
                  className="h-20 flex flex-col gap-1 border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => {
                    setSelectionLevel('decades');
                    setSelectedDecade(null);
                  }}
                >
                  <ChevronRight className="h-5 w-5 rotate-180" />
                  <span className="text-[10px] uppercase font-bold">Go Back</span>
                </Button>
                {(() => {
                  const allYears = Array.from(new Set([...games.map(g => g.year)]))
                    .filter(y => y >= selectedDecade! && y < selectedDecade! + 10)
                    .sort((a, b) => b - a);

                  return allYears.map(year => (
                    <Button
                      key={year}
                      variant="outline"
                      className="h-20 flex flex-col gap-1 transition-all duration-200 hover:border-primary/50"
                      onClick={() => {
                        setSelectedYear(year);
                        setSelectionLevel('series');
                      }}
                    >
                      <span className="text-xl font-bold">{year}</span>
                      <span className="text-[10px] uppercase opacity-60">
                        {pendingGames.some(g => g.year === year) ? 'Current' : 'View Series'}
                      </span>
                    </Button>
                  ));
                })()}
              </>
            )}

            {selectionLevel === 'series' && (
              <>
                <Button
                  variant="ghost"
                  className="h-20 flex flex-col gap-1 border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => {
                    setSelectionLevel('years');
                    setSelectedYear(null);
                  }}
                >
                  <ChevronRight className="h-5 w-5 rotate-180" />
                  <span className="text-[10px] uppercase font-bold">Go Back</span>
                </Button>
                {(() => {
                  const yearGames = games.filter(g => g.year === selectedYear);

                  return yearGames.map((game) => renderSeriesOption(game));
                })()}
              </>
            )}
          </div>

          {selectionLevel === 'decades' && (
            <div className="space-y-4 pt-6 border-t border-border/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or Create Custom</p>
              <div className="grid gap-4">
                <Button
                  variant="outline"
                  className={`w-full h-14 border-dashed justify-start px-6 gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 ${isCustomSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                  onClick={onSelectCustom}
                >
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div className="flex flex-col items-start text-left">
                    <span className="font-semibold text-sm">Custom Matchup</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Manual score entry</span>
                  </div>
                </Button>
                <p className="text-center text-[10px] text-muted-foreground leading-relaxed px-4">
                  Input your own teams and scores for custom probability analysis. Supporting simulated matchups.
                </p>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </DialogContent>
  );
}
