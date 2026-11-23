import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PredictionStatCard, StatBox } from './DesignPrimitives';

type TeamGame = {
  gameDate: string;
  matchup: string;
  wl: string;
  pts: number;
  oppScore: number;
  ast: number;
  reb: number;
  fg3m: number;
  fgPct: number;
};

type Team = {
  abbr: string;
  name: string;
  recentGames: TeamGame[];
  seasonAvg: { pts: number; reb: number; ast: number; fg3m: number };
  totalGames: number;
  nextGame?: { gameDate: string; matchup: string; opponent: string; homeAway: string } | null;
};

type TeamPred = {
  pts_predicted: number;
  pts_low: number;
  pts_high: number;
  ast_predicted: number;
  ast_low: number;
  ast_high: number;
  reb_predicted: number;
  reb_low: number;
  reb_high: number;
  fg3m_predicted: number;
  fg3m_low: number;
  fg3m_high: number;
  fgPct_predicted: number;
  opponent?: string;
  opp_pts_predicted?: number;
  win_probability?: number;
  spread?: number;
};

const EMPTY: TeamPred = {
  pts_predicted: 0,
  pts_low: 0,
  pts_high: 0,
  ast_predicted: 0,
  ast_low: 0,
  ast_high: 0,
  reb_predicted: 0,
  reb_low: 0,
  reb_high: 0,
  fg3m_predicted: 0,
  fg3m_low: 0,
  fg3m_high: 0,
  fgPct_predicted: 0,
};

export function TeamPrediction({ team, embedded = false }: { team: Team; embedded?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<TeamPred>(EMPTY);
  const [reason, setReason] = useState(
    'Click "Generate prediction" to analyze recent games and project the next team performance.',
  );
  const [hasGenerated, setHasGenerated] = useState(false);

  const generatePrediction = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/predict/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: team.abbr }),
      });
      if (!response.ok) throw new Error('Failed to generate prediction');
      const data = await response.json();
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      setPrediction({
        pts_predicted: p.pts_predicted ?? 0,
        pts_low: p.pts_low ?? 0,
        pts_high: p.pts_high ?? 0,
        ast_predicted: p.ast_predicted ?? 0,
        ast_low: p.ast_low ?? 0,
        ast_high: p.ast_high ?? 0,
        reb_predicted: p.reb_predicted ?? 0,
        reb_low: p.reb_low ?? 0,
        reb_high: p.reb_high ?? 0,
        fg3m_predicted: p.fg3m_predicted ?? 0,
        fg3m_low: p.fg3m_low ?? 0,
        fg3m_high: p.fg3m_high ?? 0,
        fgPct_predicted: p.fgPct_predicted ?? 0,
        opponent: p.opponent,
        opp_pts_predicted: p.opp_pts_predicted,
        win_probability: p.win_probability,
        spread: p.spread,
      });
      setReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (err) {
      console.error('Team prediction error:', err);
      setReason('Failed to generate prediction. Please try again.');
      toast.error('Prediction failed', { description: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  };

  const oppAbbr = prediction.opponent || team.nextGame?.opponent || 'OPP';
  const winP = prediction.win_probability ?? 50;
  const spreadStr =
    prediction.spread != null
      ? prediction.spread > 0
        ? `+${prediction.spread.toFixed(1)}`
        : prediction.spread.toFixed(1)
      : '—';

  const avgFgPct =
    team.recentGames.length > 0
      ? (team.recentGames.reduce((s, g) => s + (g.fgPct ?? 0), 0) / team.recentGames.length) * 100
      : 0;

  return (
    <div className="space-y-6 min-w-0">
      {!embedded && (
        <div className="panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">{team.name}</h2>
            <p className="num text-sm text-muted-foreground">
              {team.abbr} · {team.totalGames} games logged
            </p>
          </div>
          {team.nextGame && (
            <div className="rounded-lg bg-secondary px-4 py-2 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next game</div>
              <div className="font-semibold">
                {team.nextGame.matchup} · <span className="num text-primary">{team.nextGame.gameDate}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 stagger">
        <StatBox label="Season PPG" value={team.seasonAvg.pts} />
        <StatBox label="Season RPG" value={team.seasonAvg.reb} />
        <StatBox label="Season APG" value={team.seasonAvg.ast} />
        <StatBox label="Season 3PM" value={team.seasonAvg.fg3m} />
      </div>

      {/* Win Probability, Projected Score & Spread + Detailed Projections */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4 sm:p-6 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">AI stat projections</h3>
              <p className="text-xs text-muted-foreground">Range shows low – high confidence interval</p>
            </div>
            <button
              type="button"
              onClick={generatePrediction}
              disabled={loading}
              className="glow inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? 'Analyzing…' : hasGenerated ? 'Regenerate' : 'Generate prediction'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 stagger">
            <PredictionStatCard
              label="PTS"
              value={hasGenerated ? prediction.pts_predicted.toFixed(0) : '—'}
              rangeText={hasGenerated ? `${prediction.pts_low.toFixed(0)}–${prediction.pts_high.toFixed(0)}` : undefined}
              avgText={`avg ${team.seasonAvg.pts.toFixed(1)}`}
              hasGenerated={hasGenerated}
              predicted={prediction.pts_predicted}
              avg={team.seasonAvg.pts}
              low={prediction.pts_low}
              high={prediction.pts_high}
              recentValues={team.recentGames.map((g) => g.pts)}
              accent={hasGenerated}
            />
            <PredictionStatCard
              label="AST"
              value={hasGenerated ? prediction.ast_predicted.toFixed(0) : '—'}
              rangeText={hasGenerated ? `${prediction.ast_low.toFixed(0)}–${prediction.ast_high.toFixed(0)}` : undefined}
              avgText={`avg ${team.seasonAvg.ast.toFixed(1)}`}
              hasGenerated={hasGenerated}
              predicted={prediction.ast_predicted}
              avg={team.seasonAvg.ast}
              low={prediction.ast_low}
              high={prediction.ast_high}
              recentValues={team.recentGames.map((g) => g.ast)}
            />
            <PredictionStatCard
              label="REB"
              value={hasGenerated ? prediction.reb_predicted.toFixed(0) : '—'}
              rangeText={hasGenerated ? `${prediction.reb_low.toFixed(0)}–${prediction.reb_high.toFixed(0)}` : undefined}
              avgText={`avg ${team.seasonAvg.reb.toFixed(1)}`}
              hasGenerated={hasGenerated}
              predicted={prediction.reb_predicted}
              avg={team.seasonAvg.reb}
              low={prediction.reb_low}
              high={prediction.reb_high}
              recentValues={team.recentGames.map((g) => g.reb)}
            />
            <PredictionStatCard
              label="3PM"
              value={hasGenerated ? prediction.fg3m_predicted.toFixed(0) : '—'}
              rangeText={hasGenerated ? `${prediction.fg3m_low.toFixed(0)}–${prediction.fg3m_high.toFixed(0)}` : undefined}
              avgText={`avg ${team.seasonAvg.fg3m.toFixed(1)}`}
              hasGenerated={hasGenerated}
              predicted={prediction.fg3m_predicted}
              avg={team.seasonAvg.fg3m}
              low={prediction.fg3m_low}
              high={prediction.fg3m_high}
              recentValues={team.recentGames.map((g) => g.fg3m)}
            />
            <PredictionStatCard
              label="FG%"
              value={hasGenerated ? `${(prediction.fgPct_predicted * 100).toFixed(1)}%` : '—'}
              avgText={`avg ${avgFgPct.toFixed(1)}%`}
              hasGenerated={hasGenerated}
              predicted={prediction.fgPct_predicted * 100}
              avg={avgFgPct}
              recentValues={team.recentGames.map((g) => (g.fgPct ?? 0) * 100)}
              isPct
            />
          </div>

          <div className="mt-4 rounded-lg bg-secondary p-4 text-sm text-foreground">
            <span className="font-semibold text-primary">Reasoning: </span>
            {reason}
          </div>
        </div>

        {/* Matchup Win Probability & Spread Card */}
        <div className="panel p-4 sm:p-6 min-w-0">
          <h3 className="font-semibold">Next game prediction</h3>
          <div className="mt-4 flex items-center justify-between font-display text-lg font-bold">
            <span>{team.abbr}</span>
            <span className="text-muted-foreground">vs</span>
            <span>{oppAbbr}</span>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="fill bg-primary transition-all duration-500"
              style={{ width: `${hasGenerated ? winP : 50}%` }}
            />
            <div className="flex-1 bg-accent" />
          </div>
          <div className="num mt-2 flex justify-between text-sm">
            <span className="text-primary">{hasGenerated ? `${winP}%` : '—'}</span>
            <span className="text-accent">{hasGenerated ? `${100 - winP}%` : '—'}</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatBox
              label="Proj. score"
              value={
                hasGenerated && prediction.opp_pts_predicted != null
                  ? `${prediction.pts_predicted.toFixed(0)}–${prediction.opp_pts_predicted}`
                  : '—'
              }
            />
            <StatBox label="Spread" value={hasGenerated ? spreadStr : '—'} accent={hasGenerated} />
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-sm font-semibold">Recent games</span>
          <span className="num text-xs text-muted-foreground">{team.recentGames.length} games</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Matchup</th>
                <th className="p-3 text-center">Result</th>
                <th className="p-3 text-center">Score</th>
                <th className="p-3 text-center">AST</th>
                <th className="p-3 text-center">REB</th>
                <th className="p-3 text-center">3PM</th>
                <th className="p-3 text-center">FG%</th>
              </tr>
            </thead>
            <tbody>
              {team.recentGames.map((g, i) => (
                <tr key={i} className="border-t hover:bg-secondary">
                  <td className="num p-3 whitespace-nowrap">{g.gameDate}</td>
                  <td className="p-3 whitespace-nowrap">{g.matchup}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`num inline-block rounded px-2 py-0.5 text-xs font-bold ${
                        g.wl === 'W' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {g.wl}
                    </span>
                  </td>
                  <td className="num p-3 text-center font-semibold">
                    {g.pts}–{g.oppScore}
                  </td>
                  <td className="num p-3 text-center">{g.ast}</td>
                  <td className="num p-3 text-center">{g.reb}</td>
                  <td className="num p-3 text-center">{g.fg3m}</td>
                  <td className="num p-3 text-center">{(g.fgPct * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
