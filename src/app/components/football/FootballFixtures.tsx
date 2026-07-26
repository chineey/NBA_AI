import { useState, useEffect } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { SectionCard } from '../PredictionShared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { MatchPrediction } from './MatchPrediction';

type Competition = { id: number | null; code: string; name: string; emblem: string; area: string };

type FixtureTeam = { id: number; name: string; shortName: string; crest: string; tla: string };

type Fixture = {
  matchId: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  competition: { code: string; name: string };
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  score: { home: number; away: number } | null;
};

type When = 'upcoming' | 'results';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled', TIMED: 'Scheduled', IN_PLAY: 'Live', PAUSED: 'Live',
  FINISHED: 'FT', POSTPONED: 'Postponed', SUSPENDED: 'Suspended', CANCELLED: 'Cancelled',
};

function formatFixtureDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function TeamCrestSmall({ team }: { team: FixtureTeam }) {
  if (!team.crest) {
    return (
      <div className="size-6 rounded-full bg-gray-800 border border-white/[0.08] flex items-center justify-center shrink-0">
        <span className="text-gray-400 text-[9px] font-bold">{team.tla || team.shortName?.slice(0, 3).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <img
      src={team.crest}
      alt=""
      className="size-6 object-contain shrink-0"
      onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
    />
  );
}

export function FootballFixtures() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionCode, setCompetitionCode] = useState('ALL');
  const [when, setWhen] = useState<When>('upcoming');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [openMatchId, setOpenMatchId] = useState<number | null>(null);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${BASE}/football/competitions`)
      .then(r => r.json())
      .then(setCompetitions)
      .catch(e => { console.error(e); toast.error('Could not load competitions', { description: 'Please refresh and try again.' }); })
      .finally(() => setLoadingComps(false));
  }, []);

  useEffect(() => {
    setLoadingFixtures(true);
    fetch(`${BASE}/football/fixtures?competition_code=${competitionCode}&when=${when}`)
      .then(r => r.json())
      .then(setFixtures)
      .catch(e => { console.error(e); toast.error('Could not load fixtures', { description: 'Please try again in a moment.' }); })
      .finally(() => setLoadingFixtures(false));
  }, [competitionCode, when]);

  const subtitle = competitionCode === 'ALL'
    ? 'All competitions'
    : competitions.find(c => c.code === competitionCode)?.name;

  return (
    <>
      <SectionCard
        icon={<CalendarDays className="size-4 text-green-400" />}
        title="Fixtures"
        subtitle={subtitle}
        accent="green"
        contentClassName="p-0"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={when} onValueChange={v => setWhen(v as When)}>
              <TabsList className="h-auto w-fit rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
                <TabsTrigger
                  value="upcoming"
                  className="rounded-full px-3 py-1 text-xs font-semibold text-gray-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-green-500/25"
                >
                  Upcoming
                </TabsTrigger>
                <TabsTrigger
                  value="results"
                  className="rounded-full px-3 py-1 text-xs font-semibold text-gray-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-green-500/25"
                >
                  Results
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {!loadingComps && competitions.length > 0 && (
              <Select value={competitionCode} onValueChange={setCompetitionCode}>
                <SelectTrigger size="sm" className="w-40 border-white/[0.08] bg-white/[0.04] text-white">
                  <SelectValue placeholder="Competition" />
                </SelectTrigger>
                <SelectContent className="border-white/[0.08] bg-gray-900 text-gray-200">
                  <SelectItem value="ALL">All Competitions</SelectItem>
                  {competitions.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        }
      >
        {loadingFixtures ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        ) : fixtures.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            No {when === 'upcoming' ? 'upcoming fixtures' : 'results'} found for this selection.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {fixtures.map(f => (
              <button
                key={f.matchId}
                onClick={() => setOpenMatchId(f.matchId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="w-28 shrink-0">
                  <div className="text-gray-400 text-xs">{formatFixtureDate(f.utcDate)}</div>
                  <Badge variant="outline" className="mt-1 border-transparent bg-gray-800 px-1.5 py-0 text-[10px] text-gray-400">
                    {f.competition.code}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                    <span className="text-white text-sm font-medium truncate">{f.homeTeam.shortName}</span>
                    <TeamCrestSmall team={f.homeTeam} />
                  </div>
                  <div className="shrink-0 text-center w-14">
                    {f.score ? (
                      <span className="text-white text-sm font-bold tabular-nums">{f.score.home}–{f.score.away}</span>
                    ) : (
                      <span className="text-gray-600 text-xs">vs</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TeamCrestSmall team={f.awayTeam} />
                    <span className="text-white text-sm font-medium truncate">{f.awayTeam.shortName}</span>
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${f.status === 'FINISHED' ? 'text-gray-500' : 'text-green-400'}`}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {openMatchId !== null && (
        <MatchPrediction matchId={openMatchId} onClose={() => setOpenMatchId(null)} />
      )}
    </>
  );
}
