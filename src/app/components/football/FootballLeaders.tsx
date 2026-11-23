import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { TextAvatar } from '../DesignPrimitives';

type Competition = {
  id: number | null;
  code: string;
  name: string;
  emblem: string;
  area: string;
  hasPlayerStats: boolean;
};

export type LeaderEntry = {
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
  penalties: number | null;
  involvement: number;
  goalsPerGame: number;
  assistsPerGame: number;
  involvementPerGame: number;
};

type Props = {
  stat: 'goals' | 'assists';
  onSelectPlayer: (player: LeaderEntry) => void;
  onSelectTeam: (player: LeaderEntry) => void;
};

export function FootballLeaders({ stat, onSelectPlayer }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionCode, setCompetitionCode] = useState('');
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(true);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${BASE}/football/competitions`)
      .then((r) => r.json())
      .then((data: Competition[]) => {
        setCompetitions(data);
        setCompetitionCode((prev) => prev || data.find((c) => c.hasPlayerStats)?.code || data[0]?.code || '');
      })
      .catch((e) => {
        console.error(e);
        toast.error('Could not load competitions', { description: 'Please refresh and try again.' });
      });
  }, [BASE]);

  useEffect(() => {
    if (!competitionCode) return;
    setLoadingLeaders(true);
    fetch(`${BASE}/football/competitions/${competitionCode}/leaders?stat=${stat}`)
      .then((r) => r.json())
      .then(setLeaders)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load stat leaders', { description: 'Please try again in a moment.' });
      })
      .finally(() => setLoadingLeaders(false));
  }, [competitionCode, stat, BASE]);

  const selectable = competitions.filter((c) => c.hasPlayerStats);
  const options = selectable.length > 0 ? selectable : competitions;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{stat === 'goals' ? 'Top Scorers' : 'Top Assists'}</h2>
        <select
          value={competitionCode}
          onChange={(e) => setCompetitionCode(e.target.value)}
          className="panel px-3.5 py-2 text-sm outline-none focus:border-primary"
        >
          {options.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loadingLeaders ? (
        <div className="panel h-64 animate-pulse" />
      ) : leaders.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No leader data available.</div>
      ) : (
        <div className="panel overflow-hidden stagger">
          {leaders.map((p, i) => (
            <button
              key={p.playerId}
              type="button"
              onClick={() => onSelectPlayer(p)}
              className="flex w-full items-center gap-4 border-b px-5 py-3 text-left transition-colors last:border-0 hover:bg-secondary"
            >
              <span className={`num w-6 font-bold ${i < 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                {i + 1}
              </span>
              <TextAvatar label={p.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">{p.teamName}</div>
              </div>
              <span className="num ml-auto text-xl font-semibold">
                {stat === 'goals' ? p.goals : p.assists}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
