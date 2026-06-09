import { useState, useEffect } from 'react';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';

type FootballTeam = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
};

type Props = {
  competitionCode: string;
  competitionName: string;
  onSelectTeam: (team: FootballTeam) => void;
  onBack: () => void;
};

export function FootballTeamsGrid({ competitionCode, competitionName, onSelectTeam, onBack }: Props) {
  const [teams, setTeams] = useState<FootballTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_FOOTBALL_API_URL}/football/competitions/${competitionCode}/teams`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load teams (${r.status})`);
        return r.json();
      })
      .then(setTeams)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [competitionCode]);

  const filtered = teams.filter(
    t =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.shortName.toLowerCase().includes(search.toLowerCase()) ||
      t.tla.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-8 text-green-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-red-400">{error}</p>
        <button onClick={onBack} className="text-green-500 hover:text-green-400 text-sm underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl text-white font-semibold">{competitionName}</h2>
            <p className="text-gray-400 text-sm">{teams.length} teams</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search teams..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all text-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered.map(team => (
          <button
            key={team.id}
            onClick={() => onSelectTeam(team)}
            className="bg-gray-900 border border-gray-800 hover:border-green-500/60 hover:bg-gray-800 rounded-xl p-4 flex flex-col items-center gap-3 transition-all group"
          >
            <div className="size-16 flex items-center justify-center">
              {team.crest ? (
                <img
                  src={team.crest}
                  alt={team.name}
                  className="size-14 object-contain group-hover:scale-110 transition-transform duration-200"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                />
              ) : (
                <div className="size-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                  <span className="text-green-400 text-xs font-bold">{team.tla}</span>
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="text-white font-medium text-sm leading-tight">{team.shortName}</div>
              <div className="text-gray-500 text-xs mt-0.5">{team.tla}</div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-gray-500 py-16">
          No teams found for &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
