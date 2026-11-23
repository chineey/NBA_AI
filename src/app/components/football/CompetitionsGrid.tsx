import { useState, useEffect } from 'react';
import { toast } from 'sonner';

type Competition = {
  id: number | null;
  code: string;
  name: string;
  emblem: string;
  area: string;
};

type Props = {
  onSelect: (code: string, name: string) => void;
};

export function CompetitionsGrid({ onSelect }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${BASE}/football/competitions`)
      .then((r) => r.json())
      .then(setCompetitions)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load competitions', { description: 'Please refresh and try again.' });
      })
      .finally(() => setLoading(false));
  }, [BASE]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel h-32 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
      {competitions.map((c) => (
        <button
          key={c.code}
          type="button"
          onClick={() => onSelect(c.code, c.name)}
          className="panel panel-hover p-6 text-left"
        >
          <div className="font-display text-3xl font-bold text-primary">{c.code}</div>
          <div className="mt-3 font-semibold">{c.name}</div>
          <div className="text-sm text-muted-foreground">{c.area}</div>
        </button>
      ))}
    </div>
  );
}
