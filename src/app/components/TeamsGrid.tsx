import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PillTabs, TextAvatar } from './DesignPrimitives';

type NBATeam = {
  abbr: string;
  name: string;
  teamId: number;
  logoUrl: string;
  conf?: 'East' | 'West' | string;
  w?: number;
  l?: number;
};

type Props = {
  onSelectTeam: (abbr: string) => void;
};

export function TeamsGrid({ onSelectTeam }: Props) {
  const [teams, setTeams] = useState<NBATeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [conf, setConf] = useState<'ALL' | 'East' | 'West'>('ALL');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/teams`)
      .then((r) => r.json())
      .then(setTeams)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load NBA teams', { description: 'Please refresh and try again.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = teams.filter(
    (t) =>
      (conf === 'ALL' || t.conf === conf) &&
      (t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.abbr.toLowerCase().includes(search.toLowerCase())),
  );

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="panel h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">NBA Teams</h2>
          <PillTabs
            value={conf}
            onChange={setConf}
            items={[
              ['ALL', 'All'],
              ['East', 'East'],
              ['West', 'West'],
            ]}
          />
        </div>
        <input
          type="text"
          placeholder="Search teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="panel w-full sm:w-64 px-4 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        {filtered.map((team) => (
          <button
            key={team.abbr}
            type="button"
            onClick={() => onSelectTeam(team.abbr)}
            className="panel panel-hover p-5 text-left"
          >
            <div className="flex items-center justify-between">
              {team.logoUrl ? (
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  className="size-10 object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <TextAvatar label={team.abbr} />
              )}
              <span className="text-xs text-muted-foreground">{team.conf || team.abbr}</span>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">{team.abbr}</div>
            <div className="font-display text-lg font-bold">{team.name}</div>
            <div className="num mt-2 text-sm text-primary">
              {team.w != null && team.l != null && team.w + team.l > 0
                ? `${team.w}–${team.l}`
                : 'View roster →'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
