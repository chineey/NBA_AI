import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Trophy, TrendingUp, Sparkles } from 'lucide-react';

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

type Prediction = {
  goals_predicted: number;    goals_low: number;    goals_high: number;
  assists_predicted: number;  assists_low: number;  assists_high: number;
  involvement_predicted: number;
};

const EMPTY_PRED: Prediction = {
  goals_predicted: 0, goals_low: 0, goals_high: 0,
  assists_predicted: 0, assists_low: 0, assists_high: 0,
  involvement_predicted: 0,
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
    <div className={`size-20 text-2xl ${cls} rounded-full flex items-center justify-center border font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

function StatBox({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-gray-950 rounded-xl border border-gray-800 p-4 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${accent ? 'text-green-400' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
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
  const [predLoading, setPredLoading] = useState(false);
  const [prediction, setPrediction]   = useState<Prediction>(EMPTY_PRED);
  const [predReason, setPredReason]   = useState(
    'Click "Generate AI Prediction" to analyse this player\'s season form and predict their next match.'
  );
  const [hasGenerated, setHasGenerated] = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setError('');
    setPlayerData(null);
    setPrediction(EMPTY_PRED);
    setHasGenerated(false);
    fetch(`${BASE}/football/player/${playerId}?team_id=${teamId}&competition_code=${competitionCode}`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load player (${r.status})`);
        return r.json();
      })
      .then(setPlayerData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [playerId, teamId, competitionCode]);

  const generatePrediction = async () => {
    if (!playerData) return;
    setPredLoading(true);
    try {
      const r = await fetch(`${BASE}/football/predict/player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id:        playerId,
          player_name:      playerData.name,
          team_id:          teamId,
          competition_code: competitionCode,
        }),
      });
      if (!r.ok) throw new Error('Prediction failed');
      const data = await r.json();
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      setPrediction({
        goals_predicted:       p.goals_predicted       ?? 0,
        goals_low:             p.goals_low             ?? 0,
        goals_high:            p.goals_high            ?? 0,
        assists_predicted:     p.assists_predicted     ?? 0,
        assists_low:           p.assists_low           ?? 0,
        assists_high:          p.assists_high          ?? 0,
        involvement_predicted: p.involvement_predicted ?? 0,
      });
      setPredReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (e) {
      console.error(e);
      setPredReason('Failed to generate prediction. Please try again.');
    } finally {
      setPredLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="size-8 text-green-500 animate-spin" />
        <div className="text-green-500 animate-pulse font-medium">Loading Player Data...</div>
      </div>
    );
  }

  if (error || !playerData) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-red-400">{error || 'Failed to load player data'}</p>
        <button onClick={onBack} className="text-green-500 hover:text-green-400 text-sm underline">Go back</button>
      </div>
    );
  }

  const season = playerData.seasonStats;
  // Fall back to props if API returned empty strings
  const displayName     = playerData.name     || initialName;
  const displayPosition = playerData.position || initialPosition;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <ArrowLeft className="size-4" />
        {backLabel ?? `Back to ${teamName} squad`}
      </button>

      {/* Player header */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <PlayerAvatar name={displayName} position={displayPosition} />
            <div className="space-y-2">
              <h2 className="text-2xl text-white font-bold">{displayName}</h2>
              <p className="text-gray-400 text-sm">{teamName}{displayPosition ? ` • ${displayPosition}` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {playerData.shirtNumber != null && (
                  <span className="bg-gray-800 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                    #{playerData.shirtNumber}
                  </span>
                )}
                {playerData.nationality && (
                  <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">{playerData.nationality}</span>
                )}
                {playerData.age != null && (
                  <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">Age {playerData.age}</span>
                )}
                {playerData.dateOfBirth && (
                  <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">{playerData.dateOfBirth}</span>
                )}
              </div>
            </div>
          </div>

          {playerData.nextMatch && (
            <div className="px-4 py-3 bg-green-500/10 border border-green-500/20 rounded-xl text-right">
              <div className="text-xs text-green-400 mb-0.5">Next Match</div>
              <div className="text-white font-medium">vs {playerData.nextMatch.opponent}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {playerData.nextMatch.date} · {playerData.nextMatch.homeAway}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Season stats */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm text-gray-400 font-bold tracking-wider mb-4">
          SEASON STATS — {competitionCode}
          {season.playedMatches > 0 && (
            <span className="text-gray-600 ml-2 font-normal">({season.playedMatches} matches played)</span>
          )}
        </h3>
        {season.playedMatches === 0 ? (
          <p className="text-gray-500 text-sm">
            This player hasn't appeared in the top scorer charts for {competitionCode} this season.
            They may be a defender, goalkeeper, or have limited appearances.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <StatBox label="GOALS"        value={season.goals}          sub={`${season.goalsPerGame}/game`} accent />
            <StatBox label="ASSISTS"      value={season.assists}        sub={`${season.assistsPerGame}/game`} />
            <StatBox label="INVOLVEMENT"  value={season.involvement}    sub="goals + assists" />
            {season.penalties != null && (
              <StatBox label="PENALTIES" value={season.penalties} sub="scored" />
            )}
            <StatBox label="MATCHES"      value={season.playedMatches}  sub="played" />
          </div>
        )}
      </div>

      {/* AI Prediction */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-green-500" />
            <div>
              <h3 className="text-lg text-white">Predicted Stats for Next Match</h3>
              {hasGenerated && (
                <p className="text-xs text-gray-500 mt-0.5">Range shows low – high confidence interval</p>
              )}
            </div>
          </div>
          <button
            onClick={generatePrediction}
            disabled={predLoading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {predLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-950 rounded-lg p-4 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">GOALS</div>
              <div className="text-3xl text-white font-bold">{prediction.goals_predicted}</div>
              {hasGenerated && (
                <div className="text-xs text-gray-500 mt-1">
                  Range: <span className="text-green-400">{prediction.goals_low} – {prediction.goals_high}</span>
                </div>
              )}
            </div>
            <div className="bg-gray-950 rounded-lg p-4 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">ASSISTS</div>
              <div className="text-3xl text-white font-bold">{prediction.assists_predicted}</div>
              {hasGenerated && (
                <div className="text-xs text-gray-500 mt-1">
                  Range: <span className="text-green-400">{prediction.assists_low} – {prediction.assists_high}</span>
                </div>
              )}
            </div>
            <div className="bg-gray-950 rounded-lg p-4 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">GOAL INVOLVEMENT</div>
              <div className="text-3xl text-green-400 font-bold">{prediction.involvement_predicted}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reasoning */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <TrendingUp className="size-5 text-green-500" />
          <h3 className="text-lg text-white">Reason for Prediction</h3>
        </div>
        <div className="p-6">
          <textarea
            value={predReason}
            readOnly
            rows={4}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white focus:outline-none resize-none"
          />
          <div className="mt-4 text-sm text-gray-400">
            Tip: Consider the opponent's defensive record, home/away form, and the player's scoring consistency.
          </div>
        </div>
      </div>
    </div>
  );
}
