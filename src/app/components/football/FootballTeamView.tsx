import { useState, useEffect } from 'react';
import { Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { NextGameBadge, PredStatCard, ReasoningCard, SectionCard, GenerateButton } from '../PredictionShared';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table';
import { Skeleton } from '@/app/components/ui/skeleton';

export type SquadPlayer = {
  id: number;
  name: string;
  position: string;
  nationality: string;
  dateOfBirth: string;
  age: number | null;
};

type SquadData = {
  id: number;
  name: string;
  shortName: string;
  crest: string;
  squad: SquadPlayer[];
};

type TeamMatch = {
  matchId: number;
  date: string;
  competition: string;
  opponent: string;
  opponentCrest: string;
  homeAway: string;
  goalsFor: number;
  goalsAgainst: number;
  result: string;
  score: string;
};

type TeamStats = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  venue: string;
  founded: number | null;
  recentMatches: TeamMatch[];
  seasonStats: {
    totalMatches: number;
    wins: number;
    draws: number;
    losses: number;
    cleanSheets: number;
    goalsFor: number;
    goalsAgainst: number;
    avgGoalsFor: number;
    avgGoalsAgainst: number;
    points: number | null;
    position: number | null;
  };
  nextMatch: { date: string; opponent: string; homeAway: string; competition: string } | null;
};

type TeamPrediction = {
  goals_for_predicted: number;  goals_for_low: number;  goals_for_high: number;
  goals_against_predicted: number; goals_against_low: number; goals_against_high: number;
  clean_sheet_probability: number;
  win_probability: number; draw_probability: number; loss_probability: number;
};

const EMPTY_PRED: TeamPrediction = {
  goals_for_predicted: 0, goals_for_low: 0, goals_for_high: 0,
  goals_against_predicted: 0, goals_against_low: 0, goals_against_high: 0,
  clean_sheet_probability: 0,
  win_probability: 0, draw_probability: 0, loss_probability: 0,
};

const POS_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Defence:    'bg-blue-500/20  text-blue-400  border-blue-500/30',
  Midfield:   'bg-green-500/20 text-green-400 border-green-500/30',
  Offence:    'bg-red-500/20   text-red-400   border-red-500/30',
};

const POS_ABBR: Record<string, string> = {
  Goalkeeper: 'GK',
  Defence:    'DEF',
  Midfield:   'MID',
  Offence:    'FWD',
};

function PlayerAvatar({ player, size = 'sm' }: { player: SquadPlayer; size?: 'sm' | 'md' }) {
  const cls = POS_COLOR[player.position] || 'bg-gray-700 text-gray-300 border-gray-600';
  const dim = size === 'md' ? 'size-12 text-sm' : 'size-9 text-xs';
  const initials = player.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <Avatar className={dim}>
      <AvatarFallback className={`border font-semibold ${cls}`}>{initials}</AvatarFallback>
    </Avatar>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="gap-1 border-white/[0.06] bg-gray-950/80 p-3 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl text-white font-semibold">{value}</div>
      {sub && <div className="text-xs text-green-400">{sub}</div>}
    </Card>
  );
}

const HEAD_CLS = 'text-[11px] font-semibold tracking-wider text-gray-500 whitespace-nowrap h-10 px-3';

type Props = {
  team: { id: number; name: string; shortName: string; tla: string; crest: string; competition: { code: string; name: string } };
  onSelectPlayer: (player: SquadPlayer, teamName: string) => void;
  onBack: () => void;
};

export function FootballTeamView({ team, onSelectPlayer, onBack }: Props) {
  const competitionCode = team.competition.code;
  const [squadData, setSquadData] = useState<SquadData | null>(null);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loadingSquad, setLoadingSquad] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [predLoading, setPredLoading] = useState(false);
  const [prediction, setPrediction] = useState<TeamPrediction>(EMPTY_PRED);
  const [predReason, setPredReason] = useState(
    'Click "Generate AI Prediction" to analyse recent form and predict the next match.'
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [posFilter, setPosFilter] = useState<string>('All');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setSquadData(null);
    setTeamStats(null);
    setLoadingSquad(true);
    setLoadingStats(true);
    setPrediction(EMPTY_PRED);
    setHasGenerated(false);

    fetch(`${BASE}/football/teams/${team.id}/squad`)
      .then(r => r.json())
      .then(setSquadData)
      .catch(e => { console.error(e); toast.error('Could not load squad', { description: 'Please try again in a moment.' }); })
      .finally(() => setLoadingSquad(false));

    fetch(`${BASE}/football/teams/${team.id}?competition_code=${competitionCode}`)
      .then(r => r.json())
      .then(setTeamStats)
      .catch(e => { console.error(e); toast.error('Could not load team stats', { description: 'Please try again in a moment.' }); })
      .finally(() => setLoadingStats(false));
  }, [team.id]);

  const generatePrediction = async () => {
    if (!teamStats) return;
    setPredLoading(true);
    try {
      const r = await fetch(`${BASE}/football/predict/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id, team_name: teamStats.name, competition_code: competitionCode }),
      });
      if (!r.ok) throw new Error('Prediction failed');
      const data = await r.json();
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      setPrediction({
        goals_for_predicted: p.goals_for_predicted ?? 0,
        goals_for_low:       p.goals_for_low       ?? 0,
        goals_for_high:      p.goals_for_high      ?? 0,
        goals_against_predicted: p.goals_against_predicted ?? 0,
        goals_against_low:       p.goals_against_low       ?? 0,
        goals_against_high:      p.goals_against_high      ?? 0,
        clean_sheet_probability: p.clean_sheet_probability ?? 0,
        win_probability:  p.win_probability  ?? 0,
        draw_probability: p.draw_probability ?? 0,
        loss_probability: p.loss_probability ?? 0,
      });
      setPredReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (e) {
      console.error(e);
      setPredReason('Failed to generate prediction. Please try again.');
      toast.error('Prediction failed', { description: 'Please try again in a moment.' });
    } finally {
      setPredLoading(false);
    }
  };

  const positions = ['All', 'Goalkeeper', 'Defence', 'Midfield', 'Offence'];
  const filteredSquad = squadData?.squad.filter(
    p => posFilter === 'All' || p.position === posFilter
  ) ?? [];

  const nextGame = teamStats?.nextMatch
    ? { gameDate: teamStats.nextMatch.date, opponent: teamStats.nextMatch.opponent, homeAway: teamStats.nextMatch.homeAway, matchup: `vs ${teamStats.nextMatch.opponent}` }
    : null;

  return (
    <div className="space-y-4 animate-fade-up">
      <BackButton onClick={onBack} accent="green" />

      {/* Header */}
      <Card className="relative gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/60 p-6">
        <div aria-hidden className="absolute -top-16 -right-10 w-56 h-56 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {team.crest ? (
              <img src={team.crest} alt={team.name} className="size-14 object-contain drop-shadow-xl"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
            ) : (
              <div className="size-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/25">
                <span className="text-green-400 text-sm font-bold">{team.tla}</span>
              </div>
            )}
            <div>
              <h2 className="font-display text-2xl text-white font-bold tracking-tight">{team.name}</h2>
              {teamStats && (
                <p className="text-gray-400 text-sm mt-0.5">
                  {teamStats.venue && `${teamStats.venue} · `}
                  {teamStats.seasonStats.totalMatches} matches analysed
                </p>
              )}
            </div>
          </div>
          {nextGame && <NextGameBadge nextGame={nextGame} accent="green" />}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Squad panel */}
        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden border-white/[0.07] bg-gray-900/80 py-0">
            <div className="p-4 border-b border-white/[0.06] flex items-center gap-2">
              <Users className="size-4 text-green-500" />
              <span className="text-gray-400 text-sm font-bold tracking-wider">SQUAD</span>
            </div>

            {/* Position filter tabs */}
            <div className="p-2 border-b border-white/[0.06]">
              <Tabs value={posFilter} onValueChange={setPosFilter}>
                <TabsList className="h-auto flex-wrap justify-start rounded-lg bg-transparent p-0 gap-1">
                  {positions.map(pos => (
                    <TabsTrigger
                      key={pos}
                      value={pos}
                      className="rounded-md px-2 py-1 text-xs font-medium text-gray-400 data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:border-transparent"
                    >
                      {pos === 'Offence' ? 'FWD' : pos === 'Goalkeeper' ? 'GK' : pos === 'Defence' ? 'DEF' : pos === 'Midfield' ? 'MID' : pos}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="divide-y divide-white/[0.05] max-h-[calc(100vh-22rem)] overflow-y-auto">
              {loadingSquad ? (
                <div className="space-y-1 p-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
                  ))}
                </div>
              ) : filteredSquad.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No players found</div>
              ) : (
                filteredSquad.map(player => (
                  <button
                    key={player.id}
                    onClick={() => onSelectPlayer(player, team.name)}
                    className="w-full p-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <PlayerAvatar player={player} />
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-medium truncate">{player.name}</div>
                      <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-2">
                        <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${POS_COLOR[player.position] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                          {POS_ABBR[player.position] ?? player.position}
                        </Badge>
                        {player.nationality && <span>{player.nationality}</span>}
                        {player.age !== null && <span>{player.age} yrs</span>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Stats + Prediction panel */}
        <div className="lg:col-span-2 space-y-4">
          {loadingStats ? (
            <div className="space-y-4">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : teamStats ? (
            <>
              {/* Season stats */}
              <Card className="gap-3 border-white/[0.07] bg-gray-900/80 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm text-gray-400 font-bold tracking-wider">SEASON STATS</h3>
                  {teamStats.seasonStats.position && (
                    <Badge variant="outline" className="rounded-full border-green-500/25 bg-green-500/10 text-xs text-green-400">
                      #{teamStats.seasonStats.position} in table
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <StatCard label="W" value={teamStats.seasonStats.wins} />
                  <StatCard label="D" value={teamStats.seasonStats.draws} />
                  <StatCard label="L" value={teamStats.seasonStats.losses} />
                  {teamStats.seasonStats.points != null && (
                    <StatCard label="PTS" value={teamStats.seasonStats.points} />
                  )}
                  <StatCard label="GF" value={teamStats.seasonStats.goalsFor} sub={`${teamStats.seasonStats.avgGoalsFor}/g`} />
                  <StatCard label="GA" value={teamStats.seasonStats.goalsAgainst} sub={`${teamStats.seasonStats.avgGoalsAgainst}/g`} />
                  <StatCard label="CS" value={teamStats.seasonStats.cleanSheets} sub="clean sheets" />
                  <StatCard label="GP" value={teamStats.seasonStats.totalMatches} sub="played" />
                </div>
              </Card>

              {/* Recent matches table */}
              <SectionCard
                icon={<Users className="size-4 text-green-400" />}
                title="Recent Matches"
                accent="green"
                contentClassName="p-0"
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-gray-950/80">
                      <TableRow className="hover:bg-transparent border-white/[0.06]">
                        <TableHead className={`${HEAD_CLS} sticky left-0 bg-gray-950`}>DATE</TableHead>
                        <TableHead className={HEAD_CLS}>OPPONENT</TableHead>
                        <TableHead className={`${HEAD_CLS} text-center`}>H/A</TableHead>
                        <TableHead className={`${HEAD_CLS} text-center`}>SCORE</TableHead>
                        <TableHead className={`${HEAD_CLS} text-center`}>RES</TableHead>
                        <TableHead className={HEAD_CLS}>COMPETITION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-white/[0.04]">
                      {teamStats.recentMatches.map((m, i) => (
                        <TableRow key={i} className="border-white/[0.04] hover:bg-white/[0.03]">
                          <TableCell className="px-3 py-3 text-white sticky left-0 bg-gray-900 whitespace-nowrap">{m.date}</TableCell>
                          <TableCell className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {m.opponentCrest && (
                                <img src={m.opponentCrest} alt="" className="size-5 object-contain"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              )}
                              <span className="text-gray-300 whitespace-nowrap">{m.opponent}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-center">
                            <Badge className={`border-transparent text-xs px-1.5 py-0.5 ${m.homeAway === 'HOME' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                              {m.homeAway === 'HOME' ? 'H' : 'A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-center text-white font-medium tabular-nums">{m.score}</TableCell>
                          <TableCell className="px-3 py-3 text-center">
                            <Badge className={`border-transparent text-xs px-2 py-0.5 ${
                              m.result === 'W' ? 'bg-green-500/20 text-green-400' :
                              m.result === 'D' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {m.result}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{m.competition}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>

              {/* AI Prediction */}
              <SectionCard
                icon={<Trophy className="size-4 text-green-400" />}
                title="Predicted Stats for Next Match"
                subtitle={hasGenerated ? 'Range shows low – high confidence interval' : undefined}
                accent="green"
                action={<GenerateButton onClick={generatePrediction} loading={predLoading} hasGenerated={hasGenerated} accent="green" />}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <PredStatCard
                    label="GOALS SCORED"
                    predicted={prediction.goals_for_predicted}
                    low={prediction.goals_for_low}
                    high={prediction.goals_for_high}
                    revealed={hasGenerated}
                    accent="green"
                    index={0}
                  />
                  <PredStatCard
                    label="GOALS CONCEDED"
                    predicted={prediction.goals_against_predicted}
                    low={prediction.goals_against_low}
                    high={prediction.goals_against_high}
                    revealed={hasGenerated}
                    accent="green"
                    index={1}
                  />
                  <Card className="gap-0 border-white/[0.07] bg-gradient-to-b from-gray-950 to-gray-900/40 p-3.5">
                    <div className="text-[11px] text-gray-500 font-semibold tracking-widest mb-1.5">CLEAN SHEET %</div>
                    <div className="text-2xl text-white font-display font-bold">
                      {hasGenerated ? `${Math.round(prediction.clean_sheet_probability * 100)}%` : '—'}
                    </div>
                  </Card>
                  <Card className="gap-0 border-white/[0.07] bg-gradient-to-b from-gray-950 to-gray-900/40 p-3.5">
                    <div className="text-[11px] text-gray-500 font-semibold tracking-widest mb-2">RESULT ODDS</div>
                    {hasGenerated ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-green-400">Win</span>
                          <span className="text-white tabular-nums">{Math.round(prediction.win_probability * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-yellow-400">Draw</span>
                          <span className="text-white tabular-nums">{Math.round(prediction.draw_probability * 100)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-red-400">Loss</span>
                          <span className="text-white tabular-nums">{Math.round(prediction.loss_probability * 100)}%</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-600 text-sm">—</div>
                    )}
                  </Card>
                </div>
              </SectionCard>

              {/* Reasoning */}
              <ReasoningCard
                title="Reason for Prediction"
                reason={predReason}
                tip="Consider recent form, home advantage, head-to-head record, and key player availability."
                accent="green"
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
