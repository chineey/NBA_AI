import { Trophy, History } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NextGameBadge, PredStatCard, ReasoningCard, SectionCard, GenerateButton, type NextGame } from './PredictionShared';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table';

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

const HEAD_CLS = 'text-[11px] font-semibold tracking-wider text-gray-500 whitespace-nowrap h-10 px-3';

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
      toast.error('Prediction failed', { description: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  };

  const hasTov = team.recentGames.some(g => g.tov != null);
  const wins = team.recentGames.filter(g => g.wl === 'W').length;

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <Card className="relative gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/60 p-6">
        <div aria-hidden className="absolute -top-16 -right-10 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-white font-bold tracking-tight mb-1.5">{team.name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-gray-300">
                NBA · {team.totalGames} games this season
              </Badge>
              {team.recentGames.length > 0 && (
                <Badge variant="outline" className="rounded-full border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-300">
                  {wins}–{team.recentGames.length - wins} last {team.recentGames.length}
                </Badge>
              )}
            </div>
          </div>
          <NextGameBadge nextGame={team.nextGame} />
        </div>
      </Card>

      {/* Recent Games Table */}
      <SectionCard
        icon={<History className="size-4 text-orange-400" />}
        title="Recent Games"
        action={<span className="text-xs text-gray-500">{team.recentGames.length} games</span>}
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-950/80">
              <TableRow className="hover:bg-transparent border-white/[0.06]">
                <TableHead className={`${HEAD_CLS} sticky left-0 bg-gray-950`}>DATE</TableHead>
                <TableHead className={HEAD_CLS}>MATCHUP</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>W/L</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>PTS</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>OPP</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>AST</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>REB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>OREB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>DREB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>STL</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>BLK</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG%</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3M</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3A</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3%</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FTM</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FTA</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FT%</TableHead>
                {hasTov && <TableHead className={`${HEAD_CLS} text-center`}>TOV</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-white/[0.04]">
              {team.recentGames.map((game, i) => (
                <TableRow key={i} className="border-white/[0.04] hover:bg-white/[0.03]">
                  <TableCell className="px-3 py-3 text-white sticky left-0 bg-gray-900 whitespace-nowrap">{game.gameDate}</TableCell>
                  <TableCell className="px-3 py-3 text-gray-300 whitespace-nowrap">{game.matchup}</TableCell>
                  <TableCell className="px-3 py-3 text-center">
                    <Badge className={`size-6 justify-center rounded-md p-0 text-xs font-bold border-transparent ${
                      game.wl === 'W' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                    }`}>{game.wl}</Badge>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-center text-orange-300 font-bold tabular-nums">{game.pts}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-400 tabular-nums">{game.oppScore}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-white tabular-nums">{game.ast}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-white tabular-nums">{game.reb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.oreb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.dreb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.stl}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.blk}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fgPct * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3m}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3a}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fg3Pct * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.ftm}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fta}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.ftPct * 100).toFixed(1)}%</TableCell>
                  {hasTov && <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.tov ?? '—'}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Predicted Stats */}
      <SectionCard
        icon={<Trophy className="size-4 text-orange-400" />}
        title="Predicted Team Stats for Next Game"
        subtitle={hasGenerated ? 'Range shows low – high confidence interval' : undefined}
        action={<GenerateButton onClick={generatePrediction} loading={loading} hasGenerated={hasGenerated} />}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <PredStatCard label="PTS"  predicted={prediction.pts_predicted}  low={prediction.pts_low}  high={prediction.pts_high}  revealed={hasGenerated} index={0} />
          <PredStatCard label="AST"  predicted={prediction.ast_predicted}  low={prediction.ast_low}  high={prediction.ast_high}  revealed={hasGenerated} index={1} />
          <PredStatCard label="REB"  predicted={prediction.reb_predicted}  low={prediction.reb_low}  high={prediction.reb_high}  revealed={hasGenerated} index={2} />
          <PredStatCard label="FG3M" predicted={prediction.fg3m_predicted} low={prediction.fg3m_low} high={prediction.fg3m_high} revealed={hasGenerated} index={3} />
          <PredStatCard
            label="FG%"
            predicted={prediction.fgPct_predicted}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            revealed={hasGenerated}
            index={4}
          />
        </div>
      </SectionCard>

      {/* Reasoning */}
      <ReasoningCard
        title="Reason for Prediction"
        reason={reason}
        tip="Consider recent form, home/away splits, back-to-back fatigue, and opponent defense when interpreting predictions."
      />
    </div>
  );
}
