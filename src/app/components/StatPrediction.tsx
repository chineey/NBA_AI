import { Trophy, History, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PlayerPhoto } from './PlayerPhoto';
import { NextGameBadge, PredStatCard, ReasoningCard, SectionCard, GenerateButton, InfoChip, type NextGame } from './PredictionShared';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table';
import { Alert, AlertDescription } from '@/app/components/ui/alert';

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

const HEAD_CLS = 'text-[11px] font-semibold tracking-wider text-gray-500 whitespace-nowrap h-10 px-3';

export function StatPrediction({ player }: StatPredictionProps) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction>(EMPTY);
  const [predictionReason, setPredictionReason] = useState(
    'Click "Generate AI Prediction" to analyze recent games and predict the next performance.'
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

  const hasTov = player.recentGames.some(g => g.tov != null);

  return (
    <div className="space-y-6">
      {/* Player Header */}
      <Card className="relative gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/60 p-6">
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
      </Card>

      {/* Recent Games Table */}
      <SectionCard
        icon={<History className="size-4 text-orange-400" />}
        title="Recent Games"
        action={<span className="text-xs text-gray-500">{player.recentGames.length} games</span>}
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-950/80">
              <TableRow className="hover:bg-transparent border-white/[0.06]">
                <TableHead className={`${HEAD_CLS} sticky left-0 bg-gray-950`}>DATE</TableHead>
                <TableHead className={HEAD_CLS}>MATCHUP</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>W/L</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>MIN</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>PTS</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>AST</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>REB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>STL</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>BLK</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>OREB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>DREB</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG%</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3M</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3A</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FG3%</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FTM</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>FTA</TableHead>
                {hasTov && <TableHead className={`${HEAD_CLS} text-center`}>TOV</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-white/[0.04]">
              {player.recentGames.map((game, index) => (
                <TableRow key={index} className="border-white/[0.04] hover:bg-white/[0.03]">
                  <TableCell className="px-3 py-3 text-white sticky left-0 bg-gray-900 whitespace-nowrap">
                    {game.gameDate}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-gray-300 whitespace-nowrap">{game.matchup}</TableCell>
                  <TableCell className="px-3 py-3 text-center">
                    <Badge className={`size-6 justify-center rounded-md p-0 text-xs font-bold border-transparent ${
                      game.wl === 'W' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      {game.wl}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.min}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-orange-300 font-bold tabular-nums">{game.pts}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-white tabular-nums">{game.ast}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-white tabular-nums">{game.reb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.stl}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.blk}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.oreb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.dreb}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fgPct * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3m}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fg3a}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{(game.fg3Pct * 100).toFixed(1)}%</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.ftm ?? '—'}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.fta ?? '—'}</TableCell>
                  {hasTov && (
                    <TableCell className="px-3 py-3 text-center text-gray-300 tabular-nums">{game.tov ?? '—'}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Predicted Stats */}
      <SectionCard
        icon={<Trophy className="size-4 text-orange-400" />}
        title="Predicted Stats for Next Game"
        subtitle={hasGenerated ? 'Range shows low – high confidence interval' : undefined}
        action={<GenerateButton onClick={generatePrediction} loading={loading} hasGenerated={hasGenerated} />}
      >
        {playerStatus && (
          <Alert
            className={`mb-4 animate-fade-in ${
              playerStatus === 'OUT'
                ? 'border-red-500/25 bg-red-500/10 text-red-300'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
            }`}
          >
            <AlertTriangle className="size-4" />
            <AlertDescription className="text-inherit">
              {playerStatus === 'OUT'
                ? 'Latest news lists this player as OUT for the next game — projection assumes he plays.'
                : 'Latest news lists this player as QUESTIONABLE for the next game — projection assumes he plays.'}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <PredStatCard label="PTS"  predicted={prediction.pts_predicted}  low={prediction.pts_low}  high={prediction.pts_high}  revealed={hasGenerated} index={0} />
          <PredStatCard label="AST"  predicted={prediction.ast_predicted}  low={prediction.ast_low}  high={prediction.ast_high}  revealed={hasGenerated} index={1} />
          <PredStatCard label="REB"  predicted={prediction.reb_predicted}  low={prediction.reb_low}  high={prediction.reb_high}  revealed={hasGenerated} index={2} />
          <PredStatCard label="FG3M" predicted={prediction.fg3m_predicted} low={prediction.fg3m_low} high={prediction.fg3m_high} revealed={hasGenerated} index={3} />
          <PredStatCard label="STL"  predicted={prediction.stl_predicted} revealed={hasGenerated} index={4} />
          <PredStatCard label="BLK"  predicted={prediction.blk_predicted} revealed={hasGenerated} index={5} />
        </div>
      </SectionCard>

      {/* Prediction Reasoning */}
      <ReasoningCard
        title="Reason for Prediction"
        reason={predictionReason}
        tip="Consider factors like recent form, matchup history, injury reports, and team dynamics when making predictions."
      />
    </div>
  );
}
