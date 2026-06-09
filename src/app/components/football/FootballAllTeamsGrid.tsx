import { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';

type TeamEntry = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  competition: { code: string; name: string };
};

const LEAGUE_COLORS: Record<string, string> = {
  PL:  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  PD:  'bg-red-500/20    text-red-400    border-red-500/30',
  BL1: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  SA:  'bg-blue-500/20   text-blue-400   border-blue-500/30',
  FL1: 'bg-cyan-500/20   text-cyan-400   border-cyan-500/30',
};

const LEAGUE_LABELS: Record<string, string> = {
  PL: 'Premier League', PD: 'La Liga', BL1: 'Bundesliga', SA: 'Serie A', FL1: 'Ligue 1',
};

type Props = {
  onSelectTeam: (team: TeamEntry) => void;
};

export function FootballAllTeamsGrid({ onSelectTeam }: Props) {
  const [teams, setTeams]           = useState<TeamEntry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [leagueFilter, setLeagueFilter] = useState('All');
  const [cacheWait, setCacheWait]   = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchTeams = () => {
      fetch(`${BASE}/football/all-teams`)
        .then(r => { if (!r.ok) throw new Error(`Status ${r.status}`); return r.json(); })
        .then((data: TeamEntry[]) => {
          if (cancelled) return;
          if (data.length === 0) {
            // Cache still loading — retry in 10s
            setCacheWait(true);
            retryTimer = setTimeout(fetchTeams, 10_000);
          } else {
            setCacheWait(false);
            setTeams(data);
            setLoading(false);
          }
        })
        .catch(e => {
          if (!cancelled) { setError(e.message); setLoading(false); }
        });
    };

    fetchTeams();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, []);

  const leagues = ['All', 'PL', 'PD', 'BL1', 'SA', 'FL1'];
  const filtered = teams.filter(t => {
    const q   = search.toLowerCase();
    const hit = !q || t.name.toLowerCase().includes(q) || (t.shortName || '').toLowerCase().includes(q) || (t.tla || '').toLowerCase().includes(q);
    return hit && (leagueFilter === 'All' || t.competition.code === leagueFilter);
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="size-8 text-green-500 animate-spin" />
        <p className="text-green-500 animate-pulse text-sm">
          {cacheWait
            ? 'Server is loading team data for the first time (~2 min). Checking again in 10s…'
            : 'Loading teams from top 5 leagues…'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-red-400">Failed to load teams: {error}</p>
        <p className="text-gray-500 text-sm">Check that the backend is reachable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search teams…"
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
          {leagues.map(l => (
            <button
              key={l}
              onClick={() => setLeagueFilter(l)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                leagueFilter === l
                  ? 'bg-green-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="text-gray-500 text-sm">{filtered.length} teams</p>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filtered.map(team => (
          <button
            key={team.id}
            onClick={() => onSelectTeam(team)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-green-500/50 hover:bg-gray-800/80 transition-all group"
          >
            {team.crest ? (
              <img
                src={team.crest}
                alt={team.name}
                className="size-14 object-contain group-hover:scale-105 transition-transform"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
              />
            ) : (
              <div className="size-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <span className="text-green-400 text-xs font-bold">{team.tla}</span>
              </div>
            )}
            <div className="text-white text-xs font-medium text-center line-clamp-2 leading-tight">
              {team.shortName || team.name}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${LEAGUE_COLORS[team.competition.code] ?? 'bg-gray-700 text-gray-400 border-gray-600'}`}>
              {team.competition.code}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          No teams match "{search}"
        </div>
      )}

      {/* Legend */}
      <div className="pt-4 border-t border-gray-800 flex flex-wrap gap-3">
        {Object.entries(LEAGUE_LABELS).map(([code, name]) => (
          <span key={code} className={`text-xs px-2 py-0.5 rounded-full border ${LEAGUE_COLORS[code]}`}>
            {code} — {name}
          </span>
        ))}
      </div>
    </div>
  );
}
