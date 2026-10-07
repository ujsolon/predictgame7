import type { ReactNode } from 'react';
import type { Team } from '@/types/types';
import { LABEL, MONO } from './series-styles';
import { type GameView, type SeriesView, teamWord } from './series-view';

/**
 * `{A} {a}–{b} {B}`, scores in `mono-data`, the game's winner marked in ink
 * weight (the loser in `on-muted`). Scores are already mapped to teams by id
 * in `series-view.ts`; no home/away or venue is ever printed.
 */
function ScoreLine({ game, teamA, teamB }: { game: GameView; teamA: Team; teamB: Team }) {
  const side = (team: Team, won: boolean) =>
    won ? <strong className="font-semibold text-foreground">{teamWord(team)}</strong> : <span className="text-on-muted">{teamWord(team)}</span>;
  return (
    // Literal spaces, not flex gaps: the line must read as words in the DOM
    // text itself (prerendered HTML, AT), not only once CSS lays it out.
    <span data-game-winner={game.winner ?? ''}>
      {side(teamA, game.winner === 'a')}{' '}
      <span className={`${MONO} font-semibold text-foreground`}>
        {game.scoreA}–{game.scoreB}
      </span>{' '}
      {side(teamB, game.winner === 'b')}
    </span>
  );
}

function Cell({ label, children, sub }: { label: string; children: ReactNode; sub?: string }) {
  return (
    <div className="flex-1 px-5 py-4">
      <span className={`${LABEL} mb-1.5 block`}>{label}</span>
      <div className="text-2xl font-semibold text-foreground">{children}</div>
      {sub && <p className="mt-0.5 text-xs text-on-muted">{sub}</p>}
    </div>
  );
}

interface ScoreStripProps {
  view: SeriesView;
  /**
   * `preview`: "After six games 3–3" and games 1–6 only — the Game 7 row, its
   * scores and the final series score are not rendered at all.
   * `full`: final series, the Game 7 box, then all seven games.
   */
  mode: 'preview' | 'full';
}

export default function ScoreStrip({ view, mode }: ScoreStripProps) {
  const { teamA, teamB } = view;
  const games = mode === 'preview' ? view.games.filter((game) => game.number <= 6) : view.games;
  const game7 = mode === 'full' ? view.games.find((game) => game.number === 7) : undefined;

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border sm:flex-row sm:divide-x sm:divide-y-0">
        {mode === 'preview' ? (
          <Cell label="After six games">
            <span className={MONO}>3–3</span>
          </Cell>
        ) : (
          <>
            <Cell
              label="Final series"
              sub={view.winner && view.loser ? `${teamWord(view.winner)} over ${teamWord(view.loser)}` : undefined}
            >
              <span className={MONO}>4–3</span>
            </Cell>
            {game7 && (
              <Cell label="Game 7">
                <span className="text-lg">
                  <ScoreLine game={game7} teamA={teamA} teamB={teamB} />
                </span>
              </Cell>
            )}
          </>
        )}
      </div>

      <div>
        <h2 className={LABEL}>{mode === 'preview' ? 'Games 1–6' : 'The full record'}</h2>
        <ol className="mt-4 border-t border-border">
          {games.map((game) => (
            <li key={game.number} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-border px-1 py-4">
              <span className={`${LABEL} w-20 flex-none`}>Game {game.number}</span>{' '}
              <ScoreLine game={game} teamA={teamA} teamB={teamB} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
