import { useState, useEffect } from 'react';
import { Target, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '../PredictionShared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table';
import { Skeleton } from '@/app/components/ui/skeleton';

type Competition = { id: number | null; code: string; name: string; emblem: string; area: string; hasPlayerStats: boolean };

export type LeaderEntry = {
  playerId: number;
  name: string;
  position: string;
  nationality: string;
  teamId: number;
  teamName: string;
  teamCrest: string;
  competitionCode: string;
  goals: number;
  assists: number;
  playedMatches: number;
  penalties: number | null;
  involvement: number;
  goalsPerGame: number;
  assistsPerGame: number;
  involvementPerGame: number;
};

const POS_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-amber-500/15 text-amber-300',
  Defence:    'bg-blue-500/15  text-blue-300',
  Midfield:   'bg-green-500/15 text-green-300',
  Offence:    'bg-red-500/15   text-red-300',
};

const POS_ABBR: Record<string, string> = {
  Goalkeeper: 'GK', Defence: 'DEF', Midfield: 'MID', Offence: 'FWD',
};

const HEAD_CLS = 'text-[11px] font-semibold tracking-wider text-gray-500 whitespace-nowrap h-10 px-3';

type Props = {
  stat: 'goals' | 'assists';
  onSelectPlayer: (player: LeaderEntry) => void;
  onSelectTeam: (player: LeaderEntry) => void;
};

export function FootballLeaders({ stat, onSelectPlayer, onSelectTeam }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionCode, setCompetitionCode] = useState('');
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingLeaders, setLoadingLeaders] = useState(true);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${BASE}/football/competitions`)
      .then(r => r.json())
      .then((data: Competition[]) => {
        setCompetitions(data);
        setCompetitionCode(prev => prev || data.find(c => c.hasPlayerStats)?.code || data[0]?.code || '');
      })
      .catch(e => { console.error(e); toast.error('Could not load competitions', { description: 'Please refresh and try again.' }); })
      .finally(() => setLoadingComps(false));
  }, []);

  useEffect(() => {
    if (!competitionCode) return;
    setLoadingLeaders(true);
    fetch(`${BASE}/football/competitions/${competitionCode}/leaders?stat=${stat}`)
      .then(r => r.json())
      .then(setLeaders)
      .catch(e => { console.error(e); toast.error('Could not load stat leaders', { description: 'Please try again in a moment.' }); })
      .finally(() => setLoadingLeaders(false));
  }, [competitionCode, stat]);

  const isGoals = stat === 'goals';
  const title = isGoals ? 'Top Scorers' : 'Top Assists';
  const icon = isGoals ? <Target className="size-4 text-green-400" /> : <Zap className="size-4 text-green-400" />;
  const selectableCompetitions = competitions.filter(c => c.hasPlayerStats);
  const competitionOptions = selectableCompetitions.length > 0 ? selectableCompetitions : competitions;

  return (
    <SectionCard
      icon={icon}
      title={title}
      subtitle={competitions.find(c => c.code === competitionCode)?.name}
      accent="green"
      contentClassName="p-0"
      action={
        !loadingComps && competitions.length > 0 ? (
          <Select value={competitionCode} onValueChange={setCompetitionCode}>
            <SelectTrigger size="sm" className="w-44 border-white/[0.08] bg-white/[0.04] text-white">
              <SelectValue placeholder="Competition" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.08] bg-gray-900 text-gray-200">
              {competitionOptions.map(c => (
                <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined
      }
    >
      {loadingLeaders ? (
        <div className="space-y-1 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : leaders.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">No stats available for this competition yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-950/80">
              <TableRow className="hover:bg-transparent border-white/[0.06]">
                <TableHead className={`${HEAD_CLS} text-center`}>#</TableHead>
                <TableHead className={HEAD_CLS}>PLAYER</TableHead>
                <TableHead className={HEAD_CLS}>TEAM</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>GP</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>G</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>A</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>G/GAME</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>A/GAME</TableHead>
                <TableHead className={`${HEAD_CLS} text-center`}>G+A</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-white/[0.04]">
              {leaders.map((p, i) => (
                <TableRow
                  key={p.playerId}
                  onClick={() => onSelectPlayer(p)}
                  className="cursor-pointer border-white/[0.04] hover:bg-white/[0.03]"
                >
                  <TableCell className="px-3 py-3 text-center text-gray-500 tabular-nums">{i + 1}</TableCell>
                  <TableCell className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium whitespace-nowrap">{p.name}</span>
                      {p.position && (
                        <Badge variant="outline" className={`border-transparent px-1.5 py-0 text-[10px] ${POS_COLOR[p.position] ?? 'bg-gray-700 text-gray-400'}`}>
                          {POS_ABBR[p.position] ?? p.position}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); onSelectTeam(p); }}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {p.teamCrest && (
                        <img src={p.teamCrest} alt="" className="size-5 object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <span className="text-gray-300 whitespace-nowrap hover:text-green-400 transition-colors">{p.teamName}</span>
                    </button>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-400 tabular-nums">{p.playedMatches}</TableCell>
                  <TableCell className={`px-3 py-3 text-center tabular-nums font-semibold ${isGoals ? 'text-green-400' : 'text-white'}`}>{p.goals}</TableCell>
                  <TableCell className={`px-3 py-3 text-center tabular-nums font-semibold ${!isGoals ? 'text-green-400' : 'text-white'}`}>{p.assists}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-400 tabular-nums">{p.goalsPerGame}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-gray-400 tabular-nums">{p.assistsPerGame}</TableCell>
                  <TableCell className="px-3 py-3 text-center text-white tabular-nums">{p.involvement}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}
