import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { Series, SeriesGameScore, Team } from '@/types/types';
import { Loader2, ChevronDown, Check, Search, FilterX } from 'lucide-react';
import { toast } from 'sonner';
import { getRoundImportance, getTeamCode } from '@/lib/nba-utils';
import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';
import { usePostHog } from '@posthog/react';

interface SeriesWithNestedTeams extends Series {
  team_a?: Team;
  team_b?: Team;
  winner_team?: Team;
  series_game_scores?: SeriesGameScore[];
}

// Story 2.9 (D1), re-cut by Story 2.10 (D1'), then by the owner's review of the
// same day: the chip is the *exception* path, so the guard stands in front of the
// element rather than inside the component. An `NBA` row — 159 of 178, and every
// future one — never constructs `LeagueChip` at all: no render pass, no node.
// `showsLeagueChip` is the single copy of the rule; the component is pure
// presentation of a stored value. Verbatim, no year-derived value, no `BAA`
// folded into `NBA`. A league outside the three known ones still counts as the
// exception and renders what it says — fail visible, because an unexplained row
// is a fact the archive exists to state.
const showsLeagueChip = (league: string) => league !== 'NBA';

const LEAGUE_GLOSS =
  'BAA is the league that became the NBA in 1949, so its Game 7s are NBA history. ABA is the rival league that merged into the NBA in 1976; its series are archived here, but they are not NBA records.';

// `text-on-muted` (#595959, ~6.4:1 on the `muted` #F5F5F5 fill it sits on) rather
// than the label motif's `muted-foreground`, which is #808080 and fails AA for
// text this small until Story 5.2 retunes the token.
function LeagueChip({ league }: { league: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] uppercase leading-none tracking-widest font-semibold text-on-muted">
      {league}
    </span>
  );
}

export default function HistoricalPage() {
  const posthog = usePostHog();
  const [loading, setLoading] = useState(true);
  const [seriesList, setSeriesList] = useState<SeriesWithNestedTeams[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedSeries, setSelectedSeries] = useState<SeriesWithNestedTeams | null>(null);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [teamSearch, setTeamSearch] = useState<string>('');

  useEffect(() => {
    fetchHistoricalSeries().finally(() => setLoading(false));
  }, []);

  const fetchHistoricalSeries = async () => {
    try {
      const { data, error } = await supabase
        .from('series')
        .select('*, team_a:team_a_id(*), team_b:team_b_id(*), winner_team:winner_team_id(*), series_game_scores(*)')
        // Story 2.2 / AD-4: the archive is the derived shape — a set winner —
        // not the dropped `status` column.
        .not('winner_team_id', 'is', null);

      if (error) throw error;

      if (data) {
        const sortedData = [...data].sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return getRoundImportance(b.round) - getRoundImportance(a.round);
        });
        setSeriesList(sortedData);
      }
    } catch (err) {
      console.error('Error fetching historical series:', err);
      toast.error('Failed to load historical data');
    }
  };

  // Story 2.10 (D3') — read this before touching either number. This list is the
  // whole archive: 178 series, because the 18 `ABA` rows are archived here and
  // stay openable (AD-7), and there is deliberately no league control to scope
  // them out. Every insight denominator on the predict side is 160, because
  // Story 2.5's population rule is `league IN ('NBA','BAA')` — the marker for a
  // real Game-7 venue (migration `00016`), not a UI preference. So the counter
  // below announces 178 while the insights read 160, and the owner accepted that
  // on 2026-10-02: reconciling it in the UI would mean a filter nobody reaches
  // for, which is what 2.9's deleted `Select` was. The chip on the 19 rows plus
  // the gloss in a chipped record are the whole archive-side reconciliation; the
  // insights side is Story 2.5's owner-decision U4 footer (2026-10-02, planned).
  // Decoys with the same words that must NOT move: `epics.md:382`,
  // `ARCHITECTURE-SPINE.md:89`, `epic-2-context.md:44`, the Story 4.3 note in `sprint-status.yaml`
  // and `spec-2-5:92,99` all mean Story 2.5's backend population rule when they
  // say "league filter".
  const years = useMemo(() => {
    const uniqueYears = Array.from(new Set(seriesList.map((series) => series.year))).sort((a, b) => b - a);
    return uniqueYears;
  }, [seriesList]);

  const filteredSeries = useMemo(() => {
    // Story 2.11 (owner decisions U1 + U3): the query answers the FK row's
    // **stored** `teams.abbreviation` as well as the name, so a code a fan can
    // see is a code they can type — `SLB` finds the St. Louis Bombers and `WSB`
    // the Washington Bullets, where neither string is a substring of the name.
    // The row is already in the payload (`:64` embeds `team_a:team_a_id(*)`), so
    // this costs no query change. The name path is **not** narrowed: it stays a
    // case-insensitive `full_name` substring test with everything it returns
    // today, including the `SAS`→Kansas City hit the owner accepted rather than
    // fixed (U3) — the list sorts year-descending (`:72-74`), so the newest match
    // is the first row.
    // Review pass 2 (owner decision D3, 2026-10-05): the query is trimmed for both
    // arms, so a pasted `SLB ` finds the Bombers. Trimming only widens — it never
    // narrows the name path U3 kept — and a whitespace-only query reads as empty.
    const query = teamSearch.trim().toLowerCase();
    return seriesList.filter((series) => {
      const teamAName = series.team_a?.full_name ?? '';
      const teamBName = series.team_b?.full_name ?? '';
      const teamACode = series.team_a?.abbreviation ?? '';
      const teamBCode = series.team_b?.abbreviation ?? '';
      const matchesYear = yearFilter === 'all' || series.year.toString() === yearFilter;
      const matchesTeam =
        query === '' ||
        teamAName.toLowerCase().includes(query) ||
        teamBName.toLowerCase().includes(query) ||
        teamACode.toLowerCase().includes(query) ||
        teamBCode.toLowerCase().includes(query);
      return matchesYear && matchesTeam;
    });
  }, [seriesList, yearFilter, teamSearch]);

  const loadMore = () => {
    setVisibleCount((prev) => prev + 10);
  };

  const resetFilters = () => {
    setYearFilter('all');
    setTeamSearch('');
    setVisibleCount(10);
  };

  const formatGame7Score = (series: SeriesWithNestedTeams) => {
    const scoreRow = series.series_game_scores?.find((score) => score.game_number === 7);
    if (!scoreRow || !series.team_a || !series.team_b) return null;
    const teamAId = series.team_a_id;
    const scoreA = scoreRow.home_team_id === teamAId ? scoreRow.home_score : scoreRow.away_score;
    const scoreB = scoreRow.home_team_id === teamAId ? scoreRow.away_score : scoreRow.home_score;
    return { scoreA, scoreB };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visibleSeries = filteredSeries.slice(0, visibleCount);

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight font-montserrat">Archives</h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl leading-relaxed text-pretty">
          Explore the complete archive of every series-deciding game in NBA history, analyzed and preserved.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:flex-wrap gap-4 items-end bg-muted/20 p-4 rounded-lg border border-border/50">
        <div className="w-full md:w-[200px] space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Filter Year</label>
          <Select value={yearFilter} onValueChange={(val) => { setYearFilter(val); setVisibleCount(10); posthog?.capture('historical_filter_applied', { filter_type: 'year', year: val }); }}>
            <SelectTrigger className="bg-background border-border/60">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:flex-1 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-1">Search Team</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by team name or code..."
              className="pl-9 bg-background border-border/60"
              value={teamSearch}
              onChange={(e) => { setTeamSearch(e.target.value); setVisibleCount(10); if (e.target.value) posthog?.capture('historical_filter_applied', { filter_type: 'team_search' }); }}
            />
          </div>
        </div>
        {(yearFilter !== 'all' || teamSearch !== '') && (
          <Button variant="ghost" size="icon" onClick={resetFilters} className="h-10 w-10 text-muted-foreground hover:text-destructive transition-colors">
            <FilterX className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="space-y-8">
        <div className="w-full overflow-x-auto -mx-4 px-4 md:-mx-0 md:px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/60">
                <TableHead className="w-[80px] font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px]">Year</TableHead>
                <TableHead className="font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px]">Matchup & Round</TableHead>
                <TableHead className="text-right font-medium text-muted-foreground py-4 uppercase tracking-widest text-[10px] pr-8">Final Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSeries.length > 0 ? (
                visibleSeries.map((series) => {
                  const teamAName = series.team_a?.full_name ?? 'Team A';
                  const teamBName = series.team_b?.full_name ?? 'Team B';
                  const isTeamAWinner = series.winner_team_id === series.team_a_id;
                  // Story 2.11: the cell prints the **stored** `teams.abbreviation`
                  // of the FK row, not a name-derived initialism. Measured
                  // 2026-10-04 against the committed archive CSV, the two differ on
                  // 39 of the 178 series (47 team cells, 20 franchises, years
                  // 1948→1997 — every one a `00007` historical identity), so this is
                  // the visible half of "one team code everywhere": `Seattle
                  // SuperSonics` shows the stored `SEA` where the initialism path
                  // showed `SS`. FR-11's era-appropriate-identity rule governs it,
                  // and `teams` holds one row per era identity, so the stored code
                  // is the era-appropriate one. A join miss falls to the `Team A`/
                  // `Team B` placeholder literal (U8), never to `TA`.
                  const abbrevA = getTeamCode(teamAName, series.team_a);
                  const abbrevB = getTeamCode(teamBName, series.team_b);
                  const logoA = resolveTeamLogoUrl(series.team_a?.logo_url) || getTeamLogo(teamAName);
                  const logoB = resolveTeamLogoUrl(series.team_b?.logo_url) || getTeamLogo(teamBName);
                  const finalScore = formatGame7Score(series);

                  return (
                    <TableRow
                      key={series.id}
                      className="group border-b border-border/40 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        const isExpanding = selectedSeries?.id !== series.id;
                        setSelectedSeries(isExpanding ? series : null);
                        if (isExpanding) {
                          posthog?.capture('historical_series_expanded', {
                            series_id: series.id,
                            series_year: series.year,
                            series_round: series.round,
                            team_a: series.team_a?.full_name,
                            team_b: series.team_b?.full_name,
                            winner: series.winner_team?.full_name,
                          });
                        }
                      }}
                    >
                      <TableCell className="py-8 font-normal text-muted-foreground align-top">
                        {series.year}
                      </TableCell>
                      <TableCell className="py-8">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center gap-4 text-lg md:text-xl">
                            <div className="flex items-center gap-3 min-w-[120px]">
                              {logoA && (
                                <img src={logoA} alt={teamAName} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />
                              )}
                              <span className={`transition-colors ${isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevA}
                              </span>
                            </div>
                            <span className="text-muted-foreground/30 font-light">vs</span>
                            <div className="flex items-center gap-3 min-w-[120px]">
                              <span className={`transition-colors ${!isTeamAWinner ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}>
                                {abbrevB}
                              </span>
                              {logoB && (
                                <img src={logoB} alt={teamBName} className="h-6 w-6 object-contain grayscale group-hover:grayscale-0 transition-all" />
                              )}
                            </div>
                          </div>
                          {/* Story 2.9 (D1), re-cut by 2.10 (D1'): the chip sits
                              inline beside the round sub-label, gated by
                              `showsLeagueChip` so an `NBA` row builds nothing —
                              the table stays three columns either way and the
                              empty row colSpan={3}. */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium">{series.round}</span>
                            {showsLeagueChip(series.league) && <LeagueChip league={series.league} />}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-8 text-right pr-8">
                        <div className="flex items-center justify-end gap-3 text-lg md:text-xl tabular-nums">
                          <span className={`transition-all duration-300 ${isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {finalScore?.scoreA ?? '-'}
                          </span>
                          <span className="text-muted-foreground/20 font-light">−</span>
                          <span className={`transition-all duration-300 ${!isTeamAWinner ? 'font-semibold text-primary' : 'text-muted-foreground/60'}`}>
                            {finalScore?.scoreB ?? '-'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-20 text-center text-muted-foreground">
                    No series found matching your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {visibleCount < filteredSeries.length && (
          <div className="flex justify-center pt-8">
            <Button
              variant="ghost"
              onClick={loadMore}
              className="text-muted-foreground hover:text-foreground transition-all duration-300 gap-2 hover:bg-transparent"
            >
              <ChevronDown className="h-4 w-4" />
              Load More History
            </Button>
          </div>
        )}

        {/* Story 2.9: the filtered result set is re-announced politely. LAST
            child on purpose — as the first child it made the table wrapper a
            `space-y-8` sibling and gave it a 32px top margin it never had
            (measured over CDP: marginTop 32px → 0px by moving this node).
            `sr-only` is absolutely positioned, so the margin this rule now
            puts on the region itself paints nothing. */}
        <p aria-live="polite" className="sr-only">
          {`Showing ${visibleSeries.length} of ${filteredSeries.length} series.`}
        </p>
      </div>

      {selectedSeries && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4 md:p-8 pointer-events-none flex justify-center">
          <Card className="w-full max-w-2xl shadow-2xl border-border/50 pointer-events-auto animate-in slide-in-from-bottom-8 duration-500 bg-background/95 backdrop-blur-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  {resolveTeamLogoUrl(selectedSeries.team_a?.logo_url) && (
                    <img src={resolveTeamLogoUrl(selectedSeries.team_a?.logo_url)} alt={selectedSeries.team_a?.full_name ?? 'Team A logo'} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                  {resolveTeamLogoUrl(selectedSeries.team_b?.logo_url) && (
                    <img src={resolveTeamLogoUrl(selectedSeries.team_b?.logo_url)} alt={selectedSeries.team_b?.full_name ?? 'Team B logo'} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                  )}
                </div>
                <div className="space-y-1">
                  {/* Story 2.9 (D1) / 2.10 (D1'): the same conditional marker the
                      row carries, so the record repeats it rather than dropping
                      it. The game tiles below are untouched. */}
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl">{selectedSeries.year} {selectedSeries.round}</CardTitle>
                    {showsLeagueChip(selectedSeries.league) && <LeagueChip league={selectedSeries.league} />}
                  </div>
                  <CardDescription>{selectedSeries.team_a?.full_name} vs {selectedSeries.team_b?.full_name}</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedSeries(null)} className="h-8 w-8 p-0 rounded-full">
                <span className="sr-only">Close</span>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {selectedSeries.series_game_scores?.sort((a, b) => a.game_number - b.game_number).map((score) => {
                  const isTeamAHome = score.home_team_id === selectedSeries.team_a_id;
                  const scoreA = isTeamAHome ? score.home_score : score.away_score;
                  const scoreB = isTeamAHome ? score.away_score : score.home_score;
                  const winnerA = scoreA > scoreB;

                  return (
                    <div key={score.id} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <span className="text-[10px] uppercase tracking-tighter text-muted-foreground">G{score.game_number}</span>
                      <div className="flex flex-col items-center gap-0.5 font-mono text-[10px]">
                        <span className={winnerA ? 'font-bold text-primary' : ''}>{scoreA}</span>
                        <span className={!winnerA ? 'font-bold text-primary' : ''}>{scoreB}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Story 2.2 (owner decision 2026-09-30): the "Series Status"
                  readout is deleted, not replaced — under derivation this
                  sheet only ever opens rows the page's own predicate already
                  decided, so any truthful value there is the same word on
                  every series. The winner block spans the row. */}
              <div className="flex items-center px-4 py-3 bg-muted/40 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Series Winner</p>
                    <p className="text-base font-medium">{selectedSeries.winner_team?.full_name ?? 'Winner not available'}</p>
                  </div>
                </div>
              </div>
              {/* Story 2.10 (D2'), as revised by the owner on 2026-10-02: the
                  gloss is not a filter-row feature — BAA/ABA history is trivia to
                  an audience here for the modern game — so it is plain static
                  text at the foot of the one record that carries a chip, which is
                  where a reader needs it and needs nothing else. Static, so no
                  hover-only affordance (EXPERIENCE.md · Interaction Primitives)
                  and reachable on touch by construction. Bottom rather than the
                  header: measured on the 390px pass, in the header column the
                  sentence wrapped to six lines beside the logo stack and the
                  close button ended up vertically centred inside the paragraph. */}
              {showsLeagueChip(selectedSeries.league) && (
                <p className="text-xs leading-relaxed text-on-muted">{LEAGUE_GLOSS}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

