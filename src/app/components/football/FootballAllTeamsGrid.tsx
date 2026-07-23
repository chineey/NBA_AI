import { useState, useEffect } from 'react';
import { Search, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';

export type TeamEntry = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  competition: { code: string; name: string };
};

const LEAGUE_COLORS: Record<string, string> = {
  PL:  'bg-purple-500/15 text-purple-300 border-purple-500/25',
  PD:  'bg-red-500/15    text-red-300    border-red-500/25',
  BL1: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  SA:  'bg-blue-500/15   text-blue-300   border-blue-500/25',
  FL1: 'bg-cyan-500/15   text-cyan-300   border-cyan-500/25',
  CL:  'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  DED: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  PPL: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  ELC: 'bg-pink-500/15   text-pink-300   border-pink-500/25',
  BSA: 'bg-teal-500/15   text-teal-300   border-teal-500/25',
};

const LEAGUE_LABELS: Record<string, string> = {
  PL: 'Premier League', PD: 'La Liga', BL1: 'Bundesliga', SA: 'Serie A', FL1: 'Ligue 1',
  CL: 'Champions League', DED: 'Eredivisie', PPL: 'Primeira Liga', ELC: 'Championship', BSA: 'Brasileirão',
};

type Props = {
  teams: TeamEntry[];
  onTeamsLoaded: (teams: TeamEntry[]) => void;
  onSelectTeam: (team: TeamEntry) => void;
};

export function FootballAllTeamsGrid({ teams, onTeamsLoaded, onSelectTeam }: Props) {
  const [loading, setLoading]       = useState(teams.length === 0);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [leagueFilter, setLeagueFilter] = useState('All');
  const [cacheWait, setCacheWait]   = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (teams.length > 0) return; // Already loaded — skip fetch

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchTeams = () => {
      fetch(`${BASE}/football/all-teams`)
        .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
        .then((data: TeamEntry[]) => {
          if (cancelled) return;
          if (data.length === 0) {
            setCacheWait(true);
            retryTimer = setTimeout(fetchTeams, 10_000);
          } else {
            setCacheWait(false);
            onTeamsLoaded(data);
            setLoading(false);
          }
        })
        .catch(e => {
          if (!cancelled) {
            setError(e.message);
            setLoading(false);
            toast.error('Could not load teams', { description: 'Check that the backend is reachable.' });
          }
        });
    };

    fetchTeams();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  const leagues = ['All', 'PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC', 'BSA'];
  const filtered = (teams).filter(t => {
    const q   = search.toLowerCase();
    const hit = !q || t.name.toLowerCase().includes(q) || (t.shortName || '').toLowerCase().includes(q) || (t.tla || '').toLowerCase().includes(q);
    return hit && (leagueFilter === 'All' || t.competition.code === leagueFilter);
  });

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-9 w-full max-w-md rounded-full" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
        <p className="text-green-400/80 text-sm text-center animate-pulse">
          {cacheWait ? "Team data isn't cached yet — checking again in 10s…" : 'Loading teams from all 10 leagues…'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-2 animate-fade-in">
        <p className="text-red-400">Failed to load teams: {error}</p>
        <p className="text-gray-500 text-sm">Check that the backend is reachable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Search + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-green-400 transition-colors z-10" />
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="w-full h-auto rounded-full border-white/[0.08] bg-white/[0.04] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus-visible:ring-green-500/40 focus-visible:border-green-500/50"
          />
        </div>
        <Tabs value={leagueFilter} onValueChange={setLeagueFilter}>
          <TabsList className="h-auto flex-wrap rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
            {leagues.map(l => (
              <TabsTrigger
                key={l}
                value={l}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-green-500/25"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
        <Grid3x3 className="size-3.5" />
        {filtered.length} teams
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 stagger-children">
        {filtered.map((team, i) => (
          <button
            key={team.id}
            style={{ ['--i' as any]: Math.min(i, 24) }}
            onClick={() => onSelectTeam(team)}
            className="card-lift relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-900/60 border border-white/[0.07] hover:border-green-500/50 rounded-2xl p-4 flex flex-col items-center gap-2.5 group hover:shadow-lg hover:shadow-green-500/10"
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-24 h-24 bg-green-500/0 group-hover:bg-green-500/15 rounded-full blur-2xl transition-all duration-300" />
            {team.crest ? (
              <img
                src={team.crest}
                alt={team.name}
                className="relative size-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
              />
            ) : (
              <div className="relative size-14 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
                <span className="text-green-400 text-xs font-bold">{team.tla}</span>
              </div>
            )}
            <div className="relative text-white text-xs font-semibold text-center line-clamp-2 leading-tight">
              {team.shortName || team.name}
            </div>
            <Badge variant="outline" className={`relative rounded-full text-[10px] font-semibold px-2 py-0.5 ${LEAGUE_COLORS[team.competition.code] ?? 'bg-white/[0.04] text-gray-400 border-white/[0.08]'}`}>
              {team.competition.code}
            </Badge>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-16 animate-fade-in">
          No teams match &ldquo;{search}&rdquo;
        </div>
      )}

      {/* Legend */}
      <div className="pt-4 border-t border-white/[0.06] flex flex-wrap gap-2">
        {Object.entries(LEAGUE_LABELS).map(([code, name]) => (
          <Badge key={code} variant="outline" className={`rounded-full text-[11px] font-medium px-2.5 py-1 ${LEAGUE_COLORS[code]}`}>
            {code} — {name}
          </Badge>
        ))}
      </div>
    </div>
  );
}
