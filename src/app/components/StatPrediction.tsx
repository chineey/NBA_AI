import { useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Bars, PillTabs, PredictionStatCard, StatBox } from './DesignPrimitives';
import { formatLocalGameDateTime } from '../../lib/dateTime';

type Game = {
  gameDate: string;
  matchup: string;
  wl: string;
  min: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  oreb: number;
  dreb: number;
  ftm: number;
  fta: number;
  tov?: number | null;
};

type Player = {
  id: number;
  name: string;
  team: string;
  position: string;
  height?: string;
  weight?: string;
  jersey?: string;
  age?: number | null;
  experience?: string;
  recentGames: Game[];
  seasonAvg?: { pts: number; reb: number; ast: number };
  nextGame?: { gameDate: string; gameTimeUTC?: string; matchup: string; opponent: string; homeAway: string } | null;
};

type Prediction = {
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
  stl_predicted: number;
  blk_predicted: number;
};

const EMPTY: Prediction = {
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
  stl_predicted: 0,
  blk_predicted: 0,
};

export function StatPrediction({ player }: { player: Player }) {
  const [stat, setStat] = useState<'pts' | 'reb' | 'ast'>('pts');
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction>(EMPTY);
  const [predictionReason, setPredictionReason] = useState(
    'Click "Generate AI Prediction" to analyze recent games and predict the next performance.',
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<string | null>(null);

  const generatePrediction = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: player.name, stats: player.recentGames }),
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
        stl_predicted: p.stl_predicted ?? 0,
        blk_predicted: p.blk_predicted ?? 0,
      });
      setPredictionReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setPlayerStatus(p.player_status ?? null);
      setHasGenerated(true);
    } catch (error) {
      console.error('Prediction Error:', error);
      setPredictionReason('Failed to generate prediction. Please try again.');
      toast.error('Prediction failed', { description: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  };

  // Chronological order (oldest -> newest) for bar chart
  const chronological = [...player.recentGames].reverse();
  const data = chronological.map((g) => g[stat]);
  const labels = chronological.map((g) => g.gameDate.slice(5));
  // Use player's season average as the line
  const line = player.seasonAvg?.[stat] ?? 0;
  const hits = data.filter((v) => v >= line).length;
  const conf = data.length > 0 ? Math.round((hits / data.length) * 100) : 50;

  const aiValue =
    stat === 'pts'
      ? prediction.pts_predicted
      : stat === 'reb'
      ? prediction.reb_predicted
      : prediction.ast_predicted;

  const recentMean = (key: 'pts' | 'ast' | 'reb' | 'fg3m' | 'stl' | 'blk') => {
    if (!player.recentGames.length) return 0;
    return player.recentGames.reduce((s, g) => s + (g[key] ?? 0), 0) / player.recentGames.length;
  };
  const avgPts = player.seasonAvg?.pts ?? recentMean('pts');
  const avgAst = player.seasonAvg?.ast ?? recentMean('ast');
  const avgReb = player.seasonAvg?.reb ?? recentMean('reb');
  const avgFg3m = recentMean('fg3m');
  const avgStl = recentMean('stl');
  const avgBlk = recentMean('blk');

  return (
    <div className="space-y-6 min-w-0">
      {/* Bar chart + Season Avg line */}
      <div className="panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Recent Form vs Season Average</h3>
            {player.nextGame && (
              <p className="text-xs text-muted-foreground">
                Next: {player.nextGame.matchup} · {formatLocalGameDateTime(player.nextGame.gameDate, player.nextGame.gameTimeUTC)}
              </p>
            )}
          </div>
          <PillTabs
            value={stat}
            onChange={setStat}
            items={[
              ['pts', 'Points'],
              ['reb', 'Rebounds'],
              ['ast', 'Assists'],
            ]}
          />
        </div>

        <div className="mt-6">
          <Bars data={data} line={line} labels={labels} lineLabel={`season avg ${line.toFixed(1)}`} />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3 stagger">
          <StatBox
            label={hasGenerated ? 'AI Projection' : 'Season Avg'}
            value={hasGenerated ? aiValue.toFixed(1) : line.toFixed(1)}
            accent={hasGenerated}
          />
          <StatBox label={`Hit rate L${data.length}`} value={`${hits}/${data.length}`} />
          <div className={`panel p-3 sm:p-4 min-w-0 ${conf >= 50 ? 'border-primary/60' : 'border-accent/60'}`}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">Trend</div>
            <div
              className={`mt-1 font-display text-lg sm:text-2xl font-bold ${
                conf >= 50 ? 'text-primary' : 'text-accent'
              }`}
            >
              {conf >= 50 ? 'OVER' : 'UNDER'}
            </div>
            <div className="num truncate text-[11px] sm:text-xs text-muted-foreground">{Math.max(conf, 100 - conf)}% vs avg</div>
          </div>
        </div>
      </div>

      {/* Full AI Prediction Card */}
      <div className="panel p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">AI Next-Game Prediction</h3>
            {hasGenerated && (
              <p className="text-xs text-muted-foreground">Range shows low – high confidence interval</p>
            )}
          </div>
          <button
            type="button"
            onClick={generatePrediction}
            disabled={loading}
            className="glow inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? 'Analyzing…' : hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
          </button>
        </div>

        {playerStatus && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              playerStatus === 'OUT'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-accent/40 bg-accent/10 text-accent'
            }`}
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {playerStatus === 'OUT'
                ? 'Latest news lists this player as OUT for the next game — projection assumes he plays.'
                : 'Latest news lists this player as QUESTIONABLE for the next game — projection assumes he plays.'}
            </span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 stagger">
          <PredictionStatCard
            label="PTS"
            value={hasGenerated ? prediction.pts_predicted.toFixed(1) : '—'}
            rangeText={hasGenerated ? `${prediction.pts_low.toFixed(1)}–${prediction.pts_high.toFixed(1)}` : undefined}
            avgText={`avg ${avgPts.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.pts_predicted}
            avg={avgPts}
            low={prediction.pts_low}
            high={prediction.pts_high}
            recentValues={player.recentGames.map((g) => g.pts)}
            accent={hasGenerated}
          />
          <PredictionStatCard
            label="AST"
            value={hasGenerated ? prediction.ast_predicted.toFixed(1) : '—'}
            rangeText={hasGenerated ? `${prediction.ast_low.toFixed(1)}–${prediction.ast_high.toFixed(1)}` : undefined}
            avgText={`avg ${avgAst.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.ast_predicted}
            avg={avgAst}
            low={prediction.ast_low}
            high={prediction.ast_high}
            recentValues={player.recentGames.map((g) => g.ast)}
          />
          <PredictionStatCard
            label="REB"
            value={hasGenerated ? prediction.reb_predicted.toFixed(1) : '—'}
            rangeText={hasGenerated ? `${prediction.reb_low.toFixed(1)}–${prediction.reb_high.toFixed(1)}` : undefined}
            avgText={`avg ${avgReb.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.reb_predicted}
            avg={avgReb}
            low={prediction.reb_low}
            high={prediction.reb_high}
            recentValues={player.recentGames.map((g) => g.reb)}
          />
          <PredictionStatCard
            label="FG3M"
            value={hasGenerated ? prediction.fg3m_predicted.toFixed(1) : '—'}
            rangeText={hasGenerated ? `${prediction.fg3m_low.toFixed(1)}–${prediction.fg3m_high.toFixed(1)}` : undefined}
            avgText={`avg ${avgFg3m.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.fg3m_predicted}
            avg={avgFg3m}
            low={prediction.fg3m_low}
            high={prediction.fg3m_high}
            recentValues={player.recentGames.map((g) => g.fg3m)}
          />
          <PredictionStatCard
            label="STL"
            value={hasGenerated ? prediction.stl_predicted.toFixed(1) : '—'}
            avgText={`avg ${avgStl.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.stl_predicted}
            avg={avgStl}
            recentValues={player.recentGames.map((g) => g.stl)}
          />
          <PredictionStatCard
            label="BLK"
            value={hasGenerated ? prediction.blk_predicted.toFixed(1) : '—'}
            avgText={`avg ${avgBlk.toFixed(1)}`}
            hasGenerated={hasGenerated}
            predicted={prediction.blk_predicted}
            avg={avgBlk}
            recentValues={player.recentGames.map((g) => g.blk)}
          />
        </div>

        <div className="mt-4 rounded-lg bg-secondary p-4 text-sm">
          <span className="font-semibold text-primary">Reasoning: </span>
          {predictionReason}
        </div>
      </div>

      {/* Recent Games Table */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-sm font-semibold">Recent Games</span>
          <span className="num text-xs text-muted-foreground">{player.recentGames.length} games</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Matchup</th>
                <th className="p-3 text-center">W/L</th>
                <th className="p-3 text-center">MIN</th>
                <th className="p-3 text-center">PTS</th>
                <th className="p-3 text-center">AST</th>
                <th className="p-3 text-center">REB</th>
                <th className="p-3 text-center">STL</th>
                <th className="p-3 text-center">BLK</th>
                <th className="p-3 text-center">FG%</th>
                <th className="p-3 text-center">3PM</th>
              </tr>
            </thead>
            <tbody>
              {player.recentGames.map((g, i) => (
                <tr key={i} className="border-t hover:bg-secondary">
                  <td className="num p-3 whitespace-nowrap">{g.gameDate}</td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{g.matchup}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`num inline-block rounded px-2 py-0.5 text-xs font-bold ${
                        g.wl === 'W' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {g.wl}
                    </span>
                  </td>
                  <td className="num p-3 text-center">{g.min}</td>
                  <td className="num p-3 text-center font-semibold text-primary">{g.pts}</td>
                  <td className="num p-3 text-center">{g.ast}</td>
                  <td className="num p-3 text-center">{g.reb}</td>
                  <td className="num p-3 text-center">{g.stl}</td>
                  <td className="num p-3 text-center">{g.blk}</td>
                  <td className="num p-3 text-center">{(g.fgPct * 100).toFixed(1)}%</td>
                  <td className="num p-3 text-center">{g.fg3m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
