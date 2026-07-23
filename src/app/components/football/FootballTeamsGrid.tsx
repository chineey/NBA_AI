import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';

export type FootballTeam = {
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
      .catch(e => { setError(e.message); toast.error('Could not load teams', { description: e.message }); })
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
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 animate-fade-in">
        <p className="text-red-400">{error}</p>
        <BackButton onClick={onBack} label="Back" accent="green" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center gap-4">
        <BackButton onClick={onBack} accent="green" />
        <div className="flex-1 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-xl text-white font-bold tracking-tight">{competitionName}</h2>
            <p className="text-gray-500 text-xs mt-0.5">{teams.length} teams</p>
          </div>
          <div className="relative w-full sm:w-64 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-green-400 transition-colors z-10" />
            <Input
              type="text"
              placeholder="Search teams..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-auto rounded-full border-white/[0.08] bg-white/[0.04] pl-10 pr-4 py-2 text-white placeholder:text-gray-500 focus-visible:ring-green-500/40 focus-visible:border-green-500/50 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 stagger-children">
        {filtered.map((team, i) => (
          <button
            key={team.id}
            style={{ ['--i' as any]: i }}
            onClick={() => onSelectTeam(team)}
            className="card-lift relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-900/60 border border-white/[0.07] hover:border-green-500/50 rounded-2xl p-4 flex flex-col items-center gap-3 group hover:shadow-xl hover:shadow-green-500/10"
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-28 h-28 bg-green-500/0 group-hover:bg-green-500/15 rounded-full blur-2xl transition-all duration-300" />
            <div className="relative size-16 flex items-center justify-center">
              {team.crest ? (
                <img
                  src={team.crest}
                  alt={team.name}
                  className="size-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
              ) : (
                <div className="size-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/25">
                  <span className="text-green-400 text-xs font-bold">{team.tla}</span>
                </div>
              )}
            </div>
            <div className="relative text-center">
              <div className="text-white font-semibold text-sm leading-tight">{team.shortName}</div>
              <div className="text-gray-500 text-[11px] font-medium tracking-widest mt-1 group-hover:text-green-400/90 transition-colors">{team.tla}</div>
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
