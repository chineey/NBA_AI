import { useState, useEffect } from 'react';
import { Search, Shield } from 'lucide-react';

type NBATeam = {
  abbr: string;
  name: string;
  teamId: number;
  logoUrl: string;
};

type Props = {
  onSelectTeam: (abbr: string) => void;
};

export function TeamsGrid({ onSelectTeam }: Props) {
  const [teams, setTeams] = useState<NBATeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/teams`)
      .then(r => r.json())
      .then(setTeams)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = teams.filter(
    t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.abbr.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-9 w-56 rounded-lg shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl shimmer" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-xl bg-orange-500/15 border border-orange-500/20">
            <Shield className="size-4 text-orange-400" />
          </div>
          <div>
            <h2 className="font-display text-xl text-white font-bold tracking-tight">All NBA Teams</h2>
            <p className="text-gray-500 text-xs">{teams.length} franchises · pick one to explore its roster</p>
          </div>
        </div>
        <div className="relative w-full sm:w-64 group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-orange-400 transition-colors" />
          <input
            type="text"
            placeholder="Search teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-full pl-10 pr-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-all text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 stagger-children">
        {filtered.map((team, i) => (
          <button
            key={team.abbr}
            style={{ ['--i' as any]: i }}
            onClick={() => onSelectTeam(team.abbr)}
            className="card-lift relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-900/60 border border-white/[0.07] hover:border-orange-500/50 rounded-2xl p-4 flex flex-col items-center gap-3 group hover:shadow-xl hover:shadow-orange-500/10"
          >
            {/* hover glow behind logo */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-28 h-28 bg-orange-500/0 group-hover:bg-orange-500/15 rounded-full blur-2xl transition-all duration-300" />
            <div className="relative size-16 flex items-center justify-center">
              <img
                src={team.logoUrl}
                alt={team.name}
                className="size-14 object-contain drop-shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300"
                loading="lazy"
                onError={e => {
                  (e.target as HTMLImageElement).style.opacity = '0';
                }}
              />
            </div>
            <div className="relative text-center">
              <div className="text-white font-semibold text-sm leading-tight">{team.name}</div>
              <div className="text-gray-500 text-[11px] font-medium tracking-widest mt-1 group-hover:text-orange-400/90 transition-colors">{team.abbr}</div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-16 animate-fade-in">
          No teams found for &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
