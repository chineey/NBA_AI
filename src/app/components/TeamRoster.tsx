import { useState, useEffect } from 'react';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { PlayerPhoto } from './PlayerPhoto';
import { BackButton } from './BackButton';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';

export type RosterPlayer = {
  id: number;
  name: string;
  number: string;
  position: string;
  height: string;
  weight: string;
};

type RosterData = {
  abbr: string;
  name: string;
  teamId: number;
  logoUrl: string;
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

  useEffect(() => {
    setLoading(true);
    setError('');
    setRoster(null);
    fetch(`${import.meta.env.VITE_API_URL}/team/${abbr}/roster`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load roster');
        return r.json();
      })
      .then(setRoster)
      .catch(e => { setError(e.message); toast.error('Could not load roster', { description: e.message }); })
      .finally(() => setLoading(false));
  }, [abbr]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !roster) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 animate-fade-in">
        <p className="text-red-400">{error || 'Failed to load roster'}</p>
        <BackButton onClick={onBack} label="Back to teams" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Team header */}
      <Card className="relative gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/70 p-5">
        {/* oversized ghost logo backdrop */}
        <img
          src={roster.logoUrl}
          alt=""
          aria-hidden
          className="absolute -right-8 -top-10 size-44 object-contain opacity-[0.07] blur-[1px] pointer-events-none select-none"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="relative flex items-center gap-4">
          <BackButton onClick={onBack} label="Teams" />
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl" />
            <img
              src={roster.logoUrl}
              alt={roster.name}
              className="relative size-16 object-contain drop-shadow-xl"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
            />
          </div>
          <div>
            <h2 className="font-display text-2xl text-white font-bold tracking-tight">{roster.name}</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              <span className="text-orange-400 font-semibold">{roster.players.length}</span> players · tap a player for stats &amp; prediction
            </p>
          </div>
        </div>
      </Card>

      {/* Team Prediction CTA */}
      <button
        onClick={onPredict}
        className="w-full flex items-center justify-between relative overflow-hidden bg-gradient-to-r from-orange-500/15 via-orange-500/10 to-amber-500/5 border border-orange-500/30 hover:border-orange-400/70 rounded-2xl p-4 transition-all duration-300 group hover:shadow-lg hover:shadow-orange-500/15"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg shadow-orange-500/30 group-hover:scale-105 transition-transform">
            <TrendingUp className="size-5 text-white" />
          </div>
          <div className="text-left">
            <div className="text-white font-bold">Check Team Prediction</div>
            <div className="text-gray-400 text-sm">Recent stats &amp; AI-powered projection for the next game</div>
          </div>
        </div>
        <ArrowRight className="size-5 text-orange-400 group-hover:translate-x-1.5 transition-transform duration-300" />
      </button>

      {/* Player grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 stagger-children">
        {roster.players.map((player, i) => (
          <button
            key={player.id}
            style={{ ['--i' as any]: i }}
            onClick={() => onSelectPlayer(player)}
            className="card-lift bg-gradient-to-b from-gray-900 to-gray-900/60 border border-white/[0.07] hover:border-orange-500/50 rounded-2xl p-4 text-left group hover:shadow-lg hover:shadow-orange-500/10"
          >
            <div className="flex items-start gap-3">
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-orange-500/40 transition-all duration-300" />
                <PlayerPhoto playerId={player.id} name={player.name} size="sm" />
              </div>
              <div className="min-w-0">
                <div className="text-white font-semibold text-sm truncate group-hover:text-orange-300 transition-colors">{player.name}</div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {player.number && (
                    <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04] px-1.5 py-0 text-[10px] text-gray-400">
                      #{player.number}
                    </Badge>
                  )}
                  {player.position && (
                    <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04] px-1.5 py-0 text-[10px] text-gray-400">
                      {player.position}
                    </Badge>
                  )}
                </div>
                {(player.height || player.weight) && (
                  <div className="text-gray-600 text-xs mt-1">
                    {[player.height, player.weight ? `${player.weight} lbs` : ''].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
