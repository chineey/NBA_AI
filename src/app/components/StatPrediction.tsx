import { Trophy, Sparkles, Loader2, History } from 'lucide-react';
import { useState } from 'react';
import { PlayerPhoto } from './PlayerPhoto';
import { NextGameBadge, PredStatCard, ReasoningCard, type NextGame } from './PredictionShared';

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
  nextGame?: NextGame | null;
};

type Prediction = {
  pts_predicted: number; pts_low: number; pts_high: number;
  ast_predicted: number; ast_low: number; ast_high: number;
  reb_predicted: number; reb_low: number; reb_high: number;
  fg3m_predicted: number; fg3m_low: number; fg3m_high: number;
  stl_predicted: number;
  blk_predicted: number;
};

const EMPTY: Prediction = {
  pts_predicted: 0, pts_low: 0, pts_high: 0,
  ast_predicted: 0, ast_low: 0, ast_high: 0,
  reb_predicted: 0, reb_low: 0, reb_high: 0,
  fg3m_predicted: 0, fg3m_low: 0, fg3m_high: 0,
  stl_predicted: 0,
  blk_predicted: 0,
};

type StatPredictionProps = { player: Player };

function InfoChip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border ${
      accent
        ? 'bg-orange-500/10 text-orange-300 border-orange-500/25 font-semibold'
        : 'bg-white/[0.04] text-gray-300 border-white/[0.08]'
    }`}>
      {children}
    </span>
  );
}

export function StatPrediction({ player }: StatPredictionProps) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction>(EMPTY);
  const [predictionReason, setPredictionReason] = useState(
    'Click "Generate AI Prediction" to analyze recent games and predict the next performance.'
  );
  const [hasGenerated, setHasGenerated] = useState(false);

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
        pts_low:       p.pts_low       ?? 0,
        pts_high:      p.pts_high      ?? 0,
        ast_predicted: p.ast_predicted ?? 0,
        ast_low:       p.ast_low       ?? 0,
        ast_high:      p.ast_high      ?? 0,
        reb_predicted: p.reb_predicted ?? 0,
        reb_low:       p.reb_low       ?? 0,
        reb_high:      p.reb_high      ?? 0,
        fg3m_predicted: p.fg3m_predicted ?? 0,
        fg3m_low:       p.fg3m_low       ?? 0,
        fg3m_high:      p.fg3m_high      ?? 0,
        stl_predicted: p.stl_predicted ?? 0,
        blk_predicted: p.blk_predicted ?? 0,
      });
      setPredictionReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (error) {
      console.error('Prediction Error:', error);
      setPredictionReason('Failed to generate prediction. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasTov = player.recentGames.some(g => g.tov != null);

  return (
    <div className="space-y-6">
      {/* Player Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/60 rounded-2xl border border-white/[0.07] p-6">
        <div aria-hidden className="absolute -top-16 -right-10 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-orange-500/50 to-amber-400/20 blur-[6px]" />
              <PlayerPhoto playerId={player.id} name={player.name} size="lg" className="relative ring-2 ring-orange-500/30" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl text-white font-bold tracking-tight">{player.name}</h2>
              <p className="text-gray-400 text-sm">{player.team}{player.position ? ` • ${player.position}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {player.jersey && <InfoChip accent>#{player.jersey}</InfoChip>}
                {player.height && <InfoChip>{player.height}</InfoChip>}
                {player.weight && <InfoChip>{player.weight} lbs</InfoChip>}
                {player.age != null && <InfoChip>Age {player.age}</InfoChip>}
                {player.experience && player.experience !== '0' && (
                  <InfoChip>{player.experience} yr{player.experience === '1' ? '' : 's'} exp</InfoChip>
                )}
              </div>
            </div>
          </div>
          <NextGameBadge nextGame={player.nextGame} />
        </div>
      </div>

      {/* Recent Games Table */}
      <div className="bg-gray-900/80 rounded-2xl border border-white/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2.5 bg-white/[0.02]">
          <div className="flex items-center justify-center size-8 rounded-lg bg-orange-500/15 border border-orange-500/20">
            <History className="size-4 text-orange-400" />
          </div>
          <h3 className="text-white font-semibold">Recent Games</h3>
          <span className="ml-auto text-xs text-gray-500">{player.recentGames.length} games</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-950/80">
              <tr>
                <th className="px-3 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 sticky left-0 bg-gray-950">DATE</th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500">MATCHUP</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">W/L</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">MIN</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">PTS</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">AST</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">REB</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">STL</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">BLK</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">OREB</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">DREB</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FG%</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FG3M</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FG3A</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FG3%</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FTM</th>
                <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">FTA</th>
                {hasTov && (
                  <th className="px-3 py-3 text-center text-[11px] font-semibold tracking-wider text-gray-500">TOV</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {player.recentGames.map((game, index) => (
                <tr key={index} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-3 py-3 text-white sticky left-0 bg-gray-900 whitespace-nowrap">
                    {game.gameDate}
                  </td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{game.matchup}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center justify-center size-6 rounded-md text-xs font-bold ${
                      game.wl === 'W' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      {game.wl}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.min}</td>
                  <td className="px-3 py-3 text-center text-orange-300 font-bold tabular-nums">{game.pts}</td>
                  <td className="px-3 py-3 text-center text-white tabular-nums">{game.ast}</td>
                  <td className="px-3 py-3 text-center text-white tabular-nums">{game.reb}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.stl}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.blk}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.oreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.dreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fgPct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3m}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3a}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fg3Pct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.ftm ?? '—'}</td>
                  <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fta ?? '—'}</td>
                  {hasTov && (
                    <td className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.tov ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Predicted Stats */}
      <div className="bg-gray-900/80 rounded-2xl border border-white/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center size-8 rounded-lg bg-orange-500/15 border border-orange-500/20">
              <Trophy className="size-4 text-orange-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Predicted Stats for Next Game</h3>
              {hasGenerated && (
                <p className="text-xs text-gray-500 mt-0.5">Range shows low – high confidence interval</p>
              )}
            </div>
          </div>
          <button
            onClick={generatePrediction}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? 'Analyzing...' : hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <PredStatCard label="PTS"  predicted={prediction.pts_predicted}  low={prediction.pts_low}  high={prediction.pts_high}  revealed={hasGenerated} index={0} />
            <PredStatCard label="AST"  predicted={prediction.ast_predicted}  low={prediction.ast_low}  high={prediction.ast_high}  revealed={hasGenerated} index={1} />
            <PredStatCard label="REB"  predicted={prediction.reb_predicted}  low={prediction.reb_low}  high={prediction.reb_high}  revealed={hasGenerated} index={2} />
            <PredStatCard label="FG3M" predicted={prediction.fg3m_predicted} low={prediction.fg3m_low} high={prediction.fg3m_high} revealed={hasGenerated} index={3} />
            <PredStatCard label="STL"  predicted={prediction.stl_predicted} revealed={hasGenerated} index={4} />
            <PredStatCard label="BLK"  predicted={prediction.blk_predicted} revealed={hasGenerated} index={5} />
          </div>
        </div>
      </div>

      {/* Prediction Reasoning */}
      <ReasoningCard
        title="Reason for Prediction"
        reason={predictionReason}
        tip="Consider factors like recent form, matchup history, injury reports, and team dynamics when making predictions."
      />
    </div>
  );
}
