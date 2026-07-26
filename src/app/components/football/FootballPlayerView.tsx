import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { NextGameBadge, SectionCard, InfoChip } from '../PredictionShared';
import { Card } from '@/app/components/ui/card';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import { Skeleton } from '@/app/components/ui/skeleton';

type PlayerData = {
  id: number;
  name: string;
  position: string;
  nationality: string;
  dateOfBirth: string;
  age: number | null;
  shirtNumber: number | null;
  teamId: number;
  competitionCode: string;
  seasonStats: {
    playedMatches: number;
    goals: number;
    assists: number;
    involvement: number;
    penalties: number | null;
    goalsPerGame: number;
    assistsPerGame: number;
  };
  nextMatch: { date: string; opponent: string; homeAway: string } | null;
};

const POS_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Defence:    'bg-blue-500/20  text-blue-400  border-blue-500/30',
  Midfield:   'bg-green-500/20 text-green-400 border-green-500/30',
  Offence:    'bg-red-500/20   text-red-400   border-red-500/30',
};

function PlayerAvatar({ name, position }: { name: string; position: string }) {
  const cls = POS_COLOR[position] || 'bg-gray-700 text-gray-300 border-gray-600';
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <Avatar className="size-20 text-2xl">
      <AvatarFallback className={`border font-semibold ${cls}`}>{initials}</AvatarFallback>
    </Avatar>
  );
}

function StatBox({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <Card className="gap-1 border-white/[0.07] bg-gray-950/80 p-4 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-3xl font-bold ${accent ? 'text-green-400' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </Card>
  );
}

type Props = {
  playerId: number;
  teamId: number;
  teamName: string;
  competitionCode: string;
  initialName: string;
  initialPosition: string;
  backLabel?: string;
  onBack: () => void;
};

export function FootballPlayerView({
  playerId, teamId, teamName, competitionCode, initialName, initialPosition, backLabel, onBack,
}: Props) {
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setError('');
    setPlayerData(null);
    fetch(`${BASE}/football/player/${playerId}?team_id=${teamId}&competition_code=${competitionCode}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load player (${r.status})`);
        return r.json();
      })
      .then(setPlayerData)
      .catch(e => { setError(e.message); toast.error('Could not load player', { description: e.message }); })
      .finally(() => setLoading(false));
  }, [playerId, teamId, competitionCode]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (error || !playerData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 animate-fade-in">
        <p className="text-red-400">{error || 'Failed to load player data'}</p>
        <BackButton onClick={onBack} label={backLabel ?? `Back to ${teamName} squad`} accent="green" />
      </div>
    );
  }

  const season = playerData.seasonStats;
  // Fall back to props if API returned empty strings
  const displayName     = playerData.name     || initialName;
  const displayPosition = playerData.position || initialPosition;
  const nextGame = playerData.nextMatch
    ? { gameDate: playerData.nextMatch.date, opponent: playerData.nextMatch.opponent, homeAway: playerData.nextMatch.homeAway, matchup: `vs ${playerData.nextMatch.opponent}` }
    : null;

  return (
    <div className="space-y-6 animate-fade-up">
      <BackButton onClick={onBack} label={backLabel ?? `Back to ${teamName} squad`} accent="green" />

      {/* Player header */}
      <Card className="relative gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900/60 p-6">
        <div aria-hidden className="absolute -top-16 -right-10 w-56 h-56 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <PlayerAvatar name={displayName} position={displayPosition} />
            <div className="space-y-2">
              <h2 className="font-display text-2xl text-white font-bold tracking-tight">{displayName}</h2>
              <p className="text-gray-400 text-sm">{teamName}{displayPosition ? ` • ${displayPosition}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {playerData.shirtNumber != null && <InfoChip accent>#{playerData.shirtNumber}</InfoChip>}
                {playerData.nationality && <InfoChip>{playerData.nationality}</InfoChip>}
                {playerData.age != null && <InfoChip>Age {playerData.age}</InfoChip>}
                {playerData.dateOfBirth && <InfoChip>{playerData.dateOfBirth}</InfoChip>}
              </div>
            </div>
          </div>
          {nextGame && <NextGameBadge nextGame={nextGame} accent="green" />}
        </div>
      </Card>

      {/* Season stats */}
      <SectionCard
        icon={<Trophy className="size-4 text-green-400" />}
        title={`Season Stats — ${competitionCode}`}
        subtitle={season.playedMatches > 0 ? `${season.playedMatches} matches played` : undefined}
        accent="green"
      >
        {season.playedMatches === 0 ? (
          <p className="text-gray-500 text-sm">
            This player hasn't appeared in the top scorer charts for {competitionCode} this season.
            They may be a defender, goalkeeper, or have limited appearances.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <StatBox label="GOALS"       value={season.goals}         sub={`${season.goalsPerGame}/game`} accent />
            <StatBox label="ASSISTS"     value={season.assists}       sub={`${season.assistsPerGame}/game`} />
            <StatBox label="INVOLVEMENT" value={season.involvement}   sub="goals + assists" />
            {season.penalties != null && <StatBox label="PENALTIES" value={season.penalties} sub="scored" />}
            <StatBox label="MATCHES"     value={season.playedMatches} sub="played" />
          </div>
        )}
      </SectionCard>
    </div>
  );
}
