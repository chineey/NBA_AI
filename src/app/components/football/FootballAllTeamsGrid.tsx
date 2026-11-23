import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FormBadges, TextAvatar } from '../DesignPrimitives';

export type TeamEntry = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  competition: { code: string; name: string };
  position?: number | null;
  points?: number | null;
  form?: string | null;
};

type Props = {
  teams: TeamEntry[];
  onTeamsLoaded: (teams: TeamEntry[]) => void;
  onSelectTeam: (team: TeamEntry) => void;
};

export function FootballAllTeamsGrid({ teams, onTeamsLoaded, onSelectTeam }: Props) {
  const [loading, setLoading] = useState(teams.length === 0);
  const [search, setSearch] = useState('');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (teams.length > 0) return;
    let cancelled = false;
    fetch(`${BASE}/football/all-teams`)
      .then((r) => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json();
      })
      .then((data: TeamEntry[]) => {
        if (!cancelled) onTeamsLoaded(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error(e);
        toast.error('Could not load teams', { description: 'Please try again in a moment.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [BASE, teams.length, onTeamsLoaded]);

  const filtered = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.shortName && t.shortName.toLowerCase().includes(search.toLowerCase())) ||
      t.competition.name.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="panel h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search teams or competitions…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="panel w-full sm:w-72 px-4 py-2 text-sm outline-none focus:border-primary"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
        {filtered.map((t) => (
          <button
            key={`${t.competition.code}-${t.id}`}
            type="button"
            onClick={() => onSelectTeam(t)}
            className="panel panel-hover flex items-center gap-4 p-5 text-left"
          >
            {t.crest ? (
              <img src={t.crest} alt={t.name} className="size-10 object-contain shrink-0" />
            ) : (
              <TextAvatar label={t.shortName || t.name} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{t.shortName || t.name}</div>
              <div className="num truncate text-xs text-muted-foreground">
                {t.competition.code}
                {t.position != null ? ` · #${t.position}` : ''}
                {t.points != null ? ` · ${t.points} pts` : ''}
              </div>
            </div>
            {t.form && <FormBadges form={t.form} />}
          </button>
        ))}
      </div>
    </div>
  );
}
