import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { FormBadges, TextAvatar } from '../DesignPrimitives';

export type FootballTeam = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  position?: number | null;
  points?: number | null;
  form?: string | null;
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

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/football/competitions/${competitionCode}/teams`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load teams (${r.status})`);
        return r.json();
      })
      .then(setTeams)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load teams', { description: e.message });
      })
      .finally(() => setLoading(false));
  }, [competitionCode, BASE]);

  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="mb-6 text-3xl font-bold">{competitionName || competitionCode}</h2>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="panel h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTeam(t)}
              className="panel panel-hover flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left"
            >
              {t.crest ? (
                <img src={t.crest} alt={t.name} className="size-9 sm:size-10 object-contain shrink-0" loading="lazy" />
              ) : (
                <TextAvatar label={t.shortName || t.name} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-sm sm:text-base">{t.shortName || t.name}</div>
                <div className="num text-xs text-muted-foreground">
                  {t.position != null ? `#${t.position}` : t.tla}
                  {t.points != null ? ` · ${t.points} pts` : ''}
                </div>
              </div>
              {t.form && (
                <div className="hidden sm:block shrink-0">
                  <FormBadges form={t.form} />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
