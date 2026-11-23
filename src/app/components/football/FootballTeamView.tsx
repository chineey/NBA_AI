import { useState, useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { BackButton } from '../BackButton';
import { FormBadges, StatBox, TextAvatar } from '../DesignPrimitives';

export type SquadPlayer = {
  id: number;
  name: string;
  position: string;
  nationality?: string;
  shirtNumber?: number | null;
};

type RecentMatch = {
  matchId: number;
  date: string;
  competition: string;
  opponent: string;
  homeAway: string;
  goalsFor: number;
  goalsAgainst: number;
  result: string;
  score: string;
};

type TeamStats = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  venue?: string;
  recentMatches: RecentMatch[];
  seasonStats: {
    totalMatches: number;
    wins: number;
    draws: number;
    losses: number;
    cleanSheets: number;
    goalsFor: number;
    goalsAgainst: number;
    avgGoalsFor: number;
    avgGoalsAgainst: number;
    points: number | null;
    position: number | null;
  };
  nextMatch: { date: string; opponent: string; homeAway: string; competition: string } | null;
};

type TeamPrediction = {
  goals_for_predicted: number;
  goals_for_low: number;
  goals_for_high: number;
  goals_against_predicted: number;
  goals_against_low: number;
  goals_against_high: number;
  clean_sheet_probability: number;
  win_probability: number;
  draw_probability: number;
  loss_probability: number;
  prediction_reasoning: string;
};

type Props = {
  team: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
    competition: { code: string; name: string };
  };
  onSelectPlayer: (player: SquadPlayer, teamName: string) => void;
  onBack: () => void;
};

export function FootballTeamView({ team, onSelectPlayer, onBack }: Props) {
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullSquad, setFullSquad] = useState(false);

  const [predLoading, setPredLoading] = useState(false);
  const [prediction, setPrediction] = useState<TeamPrediction | null>(null);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setPrediction(null);
    setFullSquad(false);
    Promise.all([
      fetch(`${BASE}/football/teams/${team.id}/squad`).then((r) => r.json()),
      fetch(`${BASE}/football/teams/${team.id}?competition_code=${team.competition.code}`).then((r) => r.json()),
    ])
      .then(([squadRes, statsRes]) => {
        setSquad(Array.isArray(squadRes?.players) ? squadRes.players : Array.isArray(squadRes) ? squadRes : []);
        setStats(statsRes);
      })
      .catch((e) => {
        console.error(e);
        toast.error('Could not load team details', { description: 'Please try again in a moment.' });
      })
      .finally(() => setLoading(false));
  }, [team.id, team.competition.code, BASE]);

  const generatePrediction = async () => {
    if (!stats) return;
    setPredLoading(true);
    try {
      const r = await fetch(`${BASE}/football/predict/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: team.id,
          team_name: stats.name,
          competition_code: team.competition.code,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail ?? 'Prediction failed');
      }
      const data = await r.json();
      setPrediction(data);
    } catch (e: any) {
      console.error(e);
      toast.error('Prediction failed', { description: e.message || 'Please try again.' });
    } finally {
      setPredLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <div className="panel h-28 animate-pulse" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel h-20 animate-pulse" />
          ))}
        </div>
        <div className="panel h-48 animate-pulse" />
      </div>
    );
  }

  const formStr = stats.recentMatches
    .slice(0, 5)
    .map((m) => m.result)
    .join('');
  const moreSquad = squad.length > 4;

  return (
    <div>
      <BackButton onClick={onBack} />

      <div className="panel mb-6 flex flex-wrap items-center gap-5 p-6">
        {stats.crest ? (
          <img src={stats.crest} alt={stats.name} className="size-16 object-contain" />
        ) : (
          <TextAvatar label={stats.name} big />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="truncate text-3xl font-bold">{stats.name}</h2>
          <p className="text-muted-foreground">
            {team.competition.name || team.competition.code}
            {stats.venue ? ` · ${stats.venue}` : ''}
          </p>
        </div>
        {formStr && <FormBadges form={formStr} />}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 stagger">
        <StatBox
          label="Position"
          value={stats.seasonStats.position != null ? `#${stats.seasonStats.position}` : '—'}
        />
        <StatBox
          label="Points"
          value={stats.seasonStats.points != null ? stats.seasonStats.points : '—'}
        />
        <StatBox label="Goals for" value={stats.seasonStats.goalsFor} />
        <StatBox label="Clean sheets" value={stats.seasonStats.cleanSheets} />
      </div>

      {/* Next Match & AI Prediction */}
      {stats.nextMatch && (
        <div className="panel mb-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Next match · {stats.nextMatch.competition}
              </div>
              <h3 className="mt-1 text-lg font-semibold">
                {stats.nextMatch.homeAway === 'HOME' ? 'vs' : '@'} {stats.nextMatch.opponent}{' '}
                <span className="num text-sm text-muted-foreground">({stats.nextMatch.date})</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={generatePrediction}
              disabled={predLoading}
              className="glow inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            >
              {predLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {predLoading ? 'Predicting…' : prediction ? 'Regenerate' : 'Predict next match'}
            </button>
          </div>

          {prediction && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 stagger">
                <StatBox
                  label="Proj. Goals For"
                  value={prediction.goals_for_predicted.toFixed(2)}
                  hint={`${prediction.goals_for_low.toFixed(1)}–${prediction.goals_for_high.toFixed(1)}`}
                  accent
                />
                <StatBox
                  label="Proj. Conceded"
                  value={prediction.goals_against_predicted.toFixed(2)}
                  hint={`${prediction.goals_against_low.toFixed(1)}–${prediction.goals_against_high.toFixed(1)}`}
                />
                <StatBox
                  label="Win Prob"
                  value={`${Math.round(prediction.win_probability * 100)}%`}
                />
                <StatBox
                  label="Clean Sheet"
                  value={`${Math.round(prediction.clean_sheet_probability * 100)}%`}
                />
              </div>
              <div className="rounded-lg bg-secondary p-4 text-sm">
                <span className="font-semibold text-primary">Reasoning: </span>
                {prediction.prediction_reasoning}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Squad */}
      <div className="panel mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-sm font-semibold">Squad</span>
          <span className="num text-xs text-muted-foreground">{squad.length} players</span>
        </div>
        <div className={moreSquad && !fullSquad ? 'max-h-[240px] overflow-y-auto' : ''}>
          {squad.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPlayer(p, stats.name)}
              className="flex w-full items-center gap-3 border-b px-5 py-3 text-left text-sm transition-colors last:border-0 hover:bg-secondary"
            >
              <TextAvatar label={p.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.position || '—'}</div>
              </div>
              {p.shirtNumber != null && (
                <span className="num text-xs text-muted-foreground">#{p.shirtNumber}</span>
              )}
            </button>
          ))}
          {moreSquad && !fullSquad && (
            <div className="pointer-events-none sticky bottom-0 -mt-12 h-12 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>
        {moreSquad && (
          <button
            type="button"
            onClick={() => setFullSquad(!fullSquad)}
            className="w-full border-t px-5 py-3 text-sm font-medium text-primary transition hover:bg-secondary"
          >
            {fullSquad ? 'Show less' : `View full roster · ${squad.length} players`}
          </button>
        )}
      </div>

      {/* Recent Matches */}
      {stats.recentMatches.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <span className="text-sm font-semibold">Recent matches</span>
            <span className="num text-xs text-muted-foreground">{stats.recentMatches.length}</span>
          </div>
          {stats.recentMatches.slice(0, 8).map((m) => (
            <div
              key={m.matchId}
              className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-4 border-b px-5 py-3 text-sm last:border-0"
            >
              <span className="num text-xs text-muted-foreground">{m.date}</span>
              <span className="truncate">
                {m.homeAway === 'HOME' ? 'vs ' : '@ '}
                {m.opponent}
              </span>
              <span className="num font-semibold">{m.score}</span>
              <span
                className={`num grid size-6 place-items-center rounded text-xs font-bold ${
                  m.result === 'W'
                    ? 'bg-success/20 text-success'
                    : m.result === 'L'
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {m.result}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
