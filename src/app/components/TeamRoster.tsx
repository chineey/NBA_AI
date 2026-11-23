import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PlayerPhoto } from './PlayerPhoto';
import { BackButton } from './BackButton';

export type RosterPlayer = {
  id: number;
  name: string;
  number: string;
  position: string;
  height: string;
  weight: string;
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
};

type RosterData = {
  abbr: string;
  name: string;
  teamId: number;
  logoUrl: string;
  conf?: string;
  w?: number;
  l?: number;
  nextGame?: { gameDate: string; matchup: string; opponent: string; homeAway: string } | null;
  players: RosterPlayer[];
};

type Props = {
  abbr: string;
  onSelectPlayer: (player: RosterPlayer) => void;
  onBack: () => void;
  onPredict: () => void;
};

export function TeamRoster({ abbr, onSelectPlayer, onBack, onPredict }: Props) {
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    setRoster(null);
    setFull(false);
    fetch(`${import.meta.env.VITE_API_URL}/team/${abbr}/roster`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load roster');
        return r.json();
      })
      .then(setRoster)
      .catch((e) => {
        setError(e.message);
        toast.error('Could not load roster', { description: e.message });
      })
      .finally(() => setLoading(false));
  }, [abbr]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="panel h-24 animate-pulse" />
        <div className="panel h-64 animate-pulse" />
      </div>
    );
  }

  if (error || !roster) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-destructive">{error || 'Failed to load roster'}</p>
        <div className="mt-4">
          <BackButton onClick={onBack} label="Back to teams" />
        </div>
      </div>
    );
  }

  const more = roster.players.length > 5;
  const hasRecord = roster.w != null && roster.l != null && roster.w + roster.l > 0;

  return (
    <div className="rise">
      <BackButton onClick={onBack} label="Teams" />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={roster.logoUrl}
            alt={roster.name}
            className="size-12 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div>
            <h2 className="text-3xl font-bold">{roster.name}</h2>
            <p className="num text-xs text-muted-foreground">
              {roster.abbr}
              {roster.conf ? ` · ${roster.conf}` : ''}
              {hasRecord ? ` · ${roster.w}–${roster.l}` : ''}
              {roster.nextGame ? ` · Next: ${roster.nextGame.matchup} (${roster.nextGame.gameDate})` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onPredict}
          className="glow w-full sm:w-auto rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95"
        >
          Next game prediction →
        </button>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 sm:px-5 py-3">
          <span className="text-sm font-semibold">Roster</span>
          <span className="num text-xs text-muted-foreground">{roster.players.length} players</span>
        </div>

        <div className={`overflow-x-auto ${more && !full ? 'max-h-[320px] overflow-y-auto' : ''}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Player</th>
                <th className="p-3 text-center">Pos</th>
                <th className="p-3 text-center">PTS</th>
                <th className="p-3 text-center">REB</th>
                <th className="p-3 text-center">AST</th>
              </tr>
            </thead>
            <tbody>
              {roster.players.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelectPlayer(p)}
                  className="cursor-pointer border-t transition-colors hover:bg-secondary"
                >
                  <td className="flex items-center gap-3 p-3 font-medium">
                    <PlayerPhoto playerId={p.id} name={p.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate">{p.name}</div>
                      {p.number && (
                        <div className="num text-[11px] text-muted-foreground">#{p.number}</div>
                      )}
                    </div>
                  </td>
                  <td className="num p-3 text-center text-muted-foreground">{p.position || '—'}</td>
                  <td className="num p-3 text-center font-semibold">
                    {p.pts != null ? p.pts.toFixed(1) : '—'}
                  </td>
                  <td className="num p-3 text-center">
                    {p.reb != null ? p.reb.toFixed(1) : '—'}
                  </td>
                  <td className="num p-3 text-center">
                    {p.ast != null ? p.ast.toFixed(1) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {more && !full && (
            <div className="pointer-events-none sticky bottom-0 -mt-12 h-12 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>

        {more && (
          <button
            type="button"
            onClick={() => setFull(!full)}
            className="w-full border-t px-5 py-3 text-sm font-medium text-primary transition hover:bg-secondary"
          >
            {full ? 'Show less' : `View full roster · ${roster.players.length} players`}
          </button>
        )}
      </div>
    </div>
  );
}
