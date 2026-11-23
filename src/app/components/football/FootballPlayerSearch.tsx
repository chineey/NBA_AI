import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { TextAvatar } from '../DesignPrimitives';

export type PlayerSearchResult = {
  playerId: number;
  name: string;
  position: string;
  nationality: string;
  teamId: number;
  teamName: string;
  teamCrest: string;
  competitionCode: string;
  goals: number;
  assists: number;
  playedMatches: number;
  involvement: number;
};

type Props = {
  onSelectPlayer: (result: PlayerSearchResult) => void;
};

export function FootballPlayerSearch({ onSelectPlayer }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setNotFound(false);
    try {
      const r = await fetch(`${BASE}/football/players/search?name=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('Search failed');
      const data = await r.json();
      const list = Array.isArray(data) ? data : [];
      setResults(list);
      if (list.length === 0) setNotFound(true);
    } catch (err) {
      console.error(err);
      toast.error('Search failed', { description: 'Could not search football players right now.' });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl py-6 text-center">
        <h2 className="text-3xl font-bold md:text-4xl">
          Search football <span className="text-shine">players</span>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Find any player across top European competitions and inspect their season output.
        </p>
        <form onSubmit={search} className="mt-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player (e.g. Haaland, Saka, Yamal)…"
            className="panel flex-1 px-5 py-3.5 text-base outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={searching}
            className="glow inline-flex items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
          >
            {searching && <Loader2 className="size-4 animate-spin" />}
            Search
          </button>
        </form>
      </div>

      {notFound && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          No players found matching &ldquo;{query}&rdquo;.
        </div>
      )}

      {results.length > 0 && (
        <div className="panel overflow-hidden stagger">
          {results.map((p) => (
            <button
              key={`${p.playerId}-${p.teamId}`}
              type="button"
              onClick={() => onSelectPlayer(p)}
              className="flex w-full items-center gap-4 border-b px-5 py-3 text-left transition-colors last:border-0 hover:bg-secondary"
            >
              <TextAvatar label={p.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.teamName} · {p.position} · {p.competitionCode}
                </div>
              </div>
              <span className="num text-sm text-muted-foreground">
                {p.goals}G · {p.assists}A
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
