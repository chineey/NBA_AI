import { useState } from 'react';
import { Search, Loader2, Target } from 'lucide-react';

export type PlayerSearchResult = {
  id: number;
  name: string;
  position: string;
  nationality: string;
  teamId: number;
  teamName: string;
  teamCrest: string;
  competitionCode: string;
  competitionName: string;
  goals: number;
  assists: number;
  playedMatches: number;
  penalties: number | null;
};

const LEAGUE_COLORS: Record<string, string> = {
  PL:  'bg-purple-500/20 text-purple-400',
  PD:  'bg-red-500/20    text-red-400',
  BL1: 'bg-yellow-500/20 text-yellow-400',
  SA:  'bg-blue-500/20   text-blue-400',
  FL1: 'bg-cyan-500/20   text-cyan-400',
};

const POS_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-amber-500/20 text-amber-400',
  Defence:    'bg-blue-500/20  text-blue-400',
  Midfield:   'bg-green-500/20 text-green-400',
  Offence:    'bg-red-500/20   text-red-400',
};

type Props = {
  onSelectPlayer: (result: PlayerSearchResult) => void;
  selectedPlayerId: number | null;
};

export function FootballPlayerSearch({ onSelectPlayer, selectedPlayerId }: Props) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL;

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || q.length < 2) return;
    setLoading(true);
    setSearched(true);
    setNotFound(false);
    try {
      const r    = await fetch(`${BASE}/football/players/search?name=${encodeURIComponent(q)}`);
      const data = await r.json();
      setResults(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) setNotFound(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 flex flex-col" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
      {/* Search bar */}
      <div className="p-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search players (press Enter)…"
            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-green-500 placeholder:text-gray-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            {loading
              ? <Loader2 className="size-4 animate-spin" />
              : <Search className="size-4" />
            }
          </button>
        </div>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60">
        {!searched ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
            <Target className="size-10 text-gray-700" />
            <p className="text-gray-500 text-sm">
              Search top-100 scorers from Premier League, La Liga, Bundesliga, Serie A & Ligue 1
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 text-green-500 animate-spin" />
          </div>
        ) : notFound ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
            <p className="text-gray-500 text-sm">No players found for "{query}".</p>
            <p className="text-gray-600 text-xs">Only top-100 scorers per league are indexed. Try common names.</p>
          </div>
        ) : (
          results.map(r => {
            const isSelected = selectedPlayerId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelectPlayer(r)}
                className={`w-full p-3 flex items-center gap-3 transition-colors text-left hover:bg-gray-800 ${
                  isSelected ? 'bg-green-500/10 border-l-2 border-green-500 pl-2.5' : ''
                }`}
              >
                {/* Team crest */}
                <div className="shrink-0 size-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden">
                  {r.teamCrest ? (
                    <img
                      src={r.teamCrest}
                      alt={r.teamName}
                      className="size-7 object-contain"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-gray-400 text-xs">⚽</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{r.name}</div>
                  <div className="text-gray-500 text-xs mt-0.5 truncate">{r.teamName}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${LEAGUE_COLORS[r.competitionCode] ?? 'bg-gray-700 text-gray-400'}`}>
                      {r.competitionCode}
                    </span>
                    {r.position && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${POS_COLOR[r.position] ?? 'bg-gray-700 text-gray-400'}`}>
                        {r.position === 'Goalkeeper' ? 'GK' : r.position === 'Defence' ? 'DEF' : r.position === 'Midfield' ? 'MID' : r.position === 'Offence' ? 'FWD' : r.position}
                      </span>
                    )}
                  </div>
                </div>

                {/* Goals/assists */}
                <div className="text-right shrink-0">
                  <div className="text-green-400 text-sm font-bold">{r.goals}G</div>
                  <div className="text-gray-400 text-xs">{r.assists}A</div>
                  <div className="text-gray-600 text-xs">{r.playedMatches}gp</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
