import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { StatBox, TextAvatar } from '../DesignPrimitives';

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

type Props = {
  playerId: number;
  teamId: number;
  teamName: string;
  competitionCode: string;
  initialName: string;
  initialPosition: string;
  backLabel?: string;
  onBack: () => void;
  onSelectTeam: () => void;
};

export function FootballPlayerView({
  playerId,
  teamId,
  teamName,
  competitionCode,
  initialName,
  initialPosition,
  backLabel,
  onBack,
  onSelectTeam,
}: Props) {
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setError('');
    setPlayerData(null);
    fetch(`${BASE}/football/player/${playerId}?team_id=${teamId}&competition_code=${competitionCode}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load player (${r.status})`);
        return r.json();
      })
      .then(setPlayerData)
      .catch((e) => {
        setError(e.message);
        toast.error('Could not load player', { description: e.message });
      })
      .finally(() => setLoading(false));
  }, [playerId, teamId, competitionCode, BASE]);

  if (loading) {
    return (
      <div>
        <BackButton onClick={onBack} label={backLabel} />
        <div className="panel h-28 animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !playerData) {
    return (
      <div>
        <BackButton onClick={onBack} label={backLabel} />
        <div className="panel p-8 text-center text-destructive">{error || 'Player not found'}</div>
      </div>
    );
  }

  const s = playerData.seasonStats;
  const gPerMatch = s.playedMatches > 0 ? (s.goals / s.playedMatches).toFixed(2) : '0.00';

  return (
    <div>
      <BackButton onClick={onBack} label={backLabel} />

      <div className="panel mb-6 flex flex-wrap items-center justify-between gap-5 p-6">
        <div className="flex items-center gap-5">
          <TextAvatar label={playerData.name || initialName} big />
          <div>
            <h2 className="text-3xl font-bold">{playerData.name || initialName}</h2>
            <p className="text-muted-foreground">
              <button type="button" onClick={onSelectTeam} className="hover:text-primary hover:underline">
                {teamName}
              </button>
              {' · '}
              {playerData.position || initialPosition}
              {playerData.nationality ? ` · ${playerData.nationality}` : ''}
              {playerData.age != null ? ` · Age ${playerData.age}` : ''}
            </p>
          </div>
        </div>

        {playerData.nextMatch && (
          <div className="rounded-lg bg-secondary px-4 py-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Next match</div>
            <div className="font-semibold">
              {playerData.nextMatch.homeAway === 'HOME' ? 'vs' : '@'} {playerData.nextMatch.opponent} ·{' '}
              <span className="num text-primary">{playerData.nextMatch.date}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 stagger">
        <StatBox label="Goals" value={s.goals} accent />
        <StatBox label="Assists" value={s.assists} />
        <StatBox label="Apps" value={s.playedMatches} />
        <StatBox label="G/90" value={gPerMatch} />
      </div>
    </div>
  );
}
