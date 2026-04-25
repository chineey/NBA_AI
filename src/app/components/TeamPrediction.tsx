import { Trophy, TrendingUp, Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';

type TeamGame = {
  gameDate: string;
  matchup: string;
  wl: string;
  pts: number;
  oppScore: number;
  ast: number;
  reb: number;
  oreb: number;
  dreb: number;
  stl: number;
  blk: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  fgPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  tov: number | null;
};

type NextGame = {
  gameDate: string;
  opponent: string;
  homeAway: string;
  matchup: string;
};

type Team = {
  abbr: string;
  name: string;
  recentGames: TeamGame[];
  seasonAvg: { pts: number; reb: number; ast: number; fg3m: number };
  totalGames: number;
  nextGame?: NextGame | null;
};

type TeamPrediction = {
  pts_predicted: number; pts_low: number; pts_high: number;
  ast_predicted: number; ast_low: number; ast_high: number;
  reb_predicted: number; reb_low: number; reb_high: number;
  fg3m_predicted: number; fg3m_low: number; fg3m_high: number;
  fgPct_predicted: number;
};

const EMPTY: TeamPrediction = {
  pts_predicted: 0, pts_low: 0, pts_high: 0,
  ast_predicted: 0, ast_low: 0, ast_high: 0,
  reb_predicted: 0, reb_low: 0, reb_high: 0,
  fg3m_predicted: 0, fg3m_low: 0, fg3m_high: 0,
  fgPct_predicted: 0,
};

function StatCard({
  label, predicted, low, high, format,
}: {
  label: string; predicted: number; low?: number; high?: number;
  format?: (v: number) => string;
}) {
  const fmt = format ?? ((v) => String(v));
  return (
    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl text-white font-semibold">{fmt(predicted)}</div>
      {low !== undefined && high !== undefined && (
        <div className="text-xs text-gray-500 mt-1">
          Range: <span className="text-orange-400">{fmt(low)} – {fmt(high)}</span>
        </div>
      )}
    </div>
  );
}

export function TeamPrediction({ team }: { team: Team }) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<TeamPrediction>(EMPTY);
  const [reason, setReason] = useState(
    'Click "Generate AI Prediction" to analyze recent games and predict the next team performance.'
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
        pts_predicted: p.pts_predicted ?? 0, pts_low: p.pts_low ?? 0, pts_high: p.pts_high ?? 0,
        ast_predicted: p.ast_predicted ?? 0, ast_low: p.ast_low ?? 0, ast_high: p.ast_high ?? 0,
        reb_predicted: p.reb_predicted ?? 0, reb_low: p.reb_low ?? 0, reb_high: p.reb_high ?? 0,
        fg3m_predicted: p.fg3m_predicted ?? 0, fg3m_low: p.fg3m_low ?? 0, fg3m_high: p.fg3m_high ?? 0,
        fgPct_predicted: p.fgPct_predicted ?? 0,
      });
      setReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (err) {
      console.error('Team prediction error:', err);
      setReason('Failed to generate prediction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasTov = team.recentGames.some(g => g.tov != null);

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl text-white mb-1">{team.name}</h2>
            <p className="text-gray-400">NBA • {team.totalGames} games this season</p>
          </div>
          <div className="px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg text-right">
            <div className="text-xs text-orange-400 mb-0.5">Next Game</div>
            {team.nextGame ? (
              <>
                <div className="text-white font-medium">{team.nextGame.matchup}</div>
                <div className="text-xs text-gray-400 mt-0.5">{team.nextGame.gameDate} · {team.nextGame.homeAway}</div>
              </>
            ) : (
              <div className="text-gray-500 text-sm">TBD</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Games Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg text-white">Recent Games</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-950">
              <tr>
                <th className="px-3 py-3 text-left text-xs text-gray-400 sticky left-0 bg-gray-950">DATE</th>
                <th className="px-3 py-3 text-left text-xs text-gray-400">MATCHUP</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">W/L</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">PTS</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">OPP</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">AST</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">REB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">OREB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">DREB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">STL</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">BLK</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG%</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3M</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3A</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3%</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FTM</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FTA</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FT%</th>
                {hasTov && <th className="px-3 py-3 text-center text-xs text-gray-400">TOV</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {team.recentGames.map((game, i) => (
                <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-3 text-white sticky left-0 bg-gray-900 hover:bg-gray-800/50">{game.gameDate}</td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{game.matchup}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      game.wl === 'W' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>{game.wl}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-white font-medium">{game.pts}</td>
                  <td className="px-3 py-3 text-center text-gray-400">{game.oppScore}</td>
                  <td className="px-3 py-3 text-center text-white">{game.ast}</td>
                  <td className="px-3 py-3 text-center text-white">{game.reb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.oreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.dreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.stl}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.blk}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{(game.fgPct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.fg3m}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.fg3a}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{(game.fg3Pct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.ftm}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.fta}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{(game.ftPct * 100).toFixed(1)}%</td>
                  {hasTov && <td className="px-3 py-3 text-center text-gray-300">{game.tov ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Predicted Stats */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-orange-500" />
            <div>
              <h3 className="text-lg text-white">Predicted Team Stats for Next Game</h3>
              {hasGenerated && (
                <p className="text-xs text-gray-500 mt-0.5">Range shows low – high confidence interval</p>
              )}
            </div>
          </div>
          <button
            onClick={generatePrediction}
            disabled={loading}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard label="PTS"  predicted={prediction.pts_predicted}  low={prediction.pts_low}  high={prediction.pts_high} />
            <StatCard label="AST"  predicted={prediction.ast_predicted}  low={prediction.ast_low}  high={prediction.ast_high} />
            <StatCard label="REB"  predicted={prediction.reb_predicted}  low={prediction.reb_low}  high={prediction.reb_high} />
            <StatCard label="FG3M" predicted={prediction.fg3m_predicted} low={prediction.fg3m_low} high={prediction.fg3m_high} />
            <StatCard
              label="FG%"
              predicted={prediction.fgPct_predicted}
              format={(v) => `${(v * 100).toFixed(1)}%`}
            />
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <TrendingUp className="size-5 text-orange-500" />
          <h3 className="text-lg text-white">Reason for Prediction</h3>
        </div>
        <div className="p-6">
          <textarea
            value={reason}
            readOnly
            rows={4}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
          />
          <div className="mt-4 text-sm text-gray-400">
            Tip: Consider recent form, home/away splits, back-to-back fatigue, and opponent defense when interpreting predictions.
          </div>
        </div>
      </div>
    </div>
  );
}
