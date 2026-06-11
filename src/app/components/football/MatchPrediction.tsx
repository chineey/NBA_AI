import { useState, useEffect } from 'react';
import { X, Target, BarChart3, Goal, Sparkles } from 'lucide-react';

const FOOTBALL_API = import.meta.env.VITE_FOOTBALL_API_URL ?? 'http://127.0.0.1:8001';

interface TeamInfo { id: number; name: string; shortName: string; crest: string; tla: string }

interface FormInfo {
  attack: number; defense: number; matches: number;
  avgScored: number; avgConceded: number; form: string;
  recent: { date: string; opponent: string; score: string; result: string }[];
}

interface PredictionData {
  matchId: number;
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  actualScore: { home: number | null; away: number | null } | null;
  model: {
    type: string;
    expectedGoals: { home: number; away: number };
    homeForm: FormInfo;
    awayForm: FormInfo;
  };
  prediction: {
    outcome: {
      homeWin: number; draw: number; awayWin: number;
      doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number };
      overUnder: Record<string, { over: number; under: number }>;
      btts: { yes: number; no: number };
    };
    predictedScore: { home: number; away: number };
    correctScores: { score: string; probability: number }[];
    reasoning: string;
  };
  disclaimer: string;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function TeamCrest({ team }: { team: TeamInfo }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [team.id]);
  if (!team.crest || failed) {
    return (
      <div className="size-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
        <span className="text-gray-300 text-xs font-bold tracking-wide">{team.tla || team.shortName.slice(0, 3).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <img
      src={team.crest}
      alt={team.shortName}
      className="size-12 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function FormBadges({ form }: { form: string }) {
  if (!form) return null;
  return (
    <div className="flex gap-1">
      {form.split('').map((r, i) => (
        <span
          key={i}
          className={`size-5 rounded text-[10px] font-bold flex items-center justify-center ${
            r === 'W' ? 'bg-green-500/20 text-green-400'
            : r === 'D' ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-red-500/20 text-red-400'
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export function MatchPrediction({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [data, setData]       = useState<PredictionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${FOOTBALL_API}/football/worldcup/predict/${matchId}`)
      .then(r => {
        if (!r.ok) return r.json().then(b => { throw new Error(b.detail ?? `Error ${r.status}`); });
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [matchId]);

  const outcome = data?.prediction.outcome;
  const maxOutcome = outcome
    ? Math.max(outcome.homeWin, outcome.draw, outcome.awayWin)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl m-auto overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/60">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-green-400" />
            <h3 className="text-white font-semibold">Match Prediction</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="size-8 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Running the model…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
            <p className="text-red-400 font-medium">Prediction unavailable</p>
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        )}

        {data && outcome && (
          <div className="p-5 space-y-6">

            {/* Teams + predicted score */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                <TeamCrest team={data.homeTeam} />
                <span className="text-white text-sm font-medium text-center">{data.homeTeam.shortName}</span>
                <FormBadges form={data.model.homeForm.form} />
              </div>

              <div className="flex flex-col items-center shrink-0">
                <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Predicted FT</span>
                <span className="text-white text-4xl font-bold tabular-nums">
                  {data.prediction.predictedScore.home}–{data.prediction.predictedScore.away}
                </span>
                <span className="text-gray-500 text-xs mt-1">
                  xG {data.model.expectedGoals.home} – {data.model.expectedGoals.away}
                </span>
                {data.actualScore && data.actualScore.home !== null && (
                  <span className="text-green-400/80 text-xs mt-1">
                    Actual: {data.actualScore.home}–{data.actualScore.away}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                <TeamCrest team={data.awayTeam} />
                <span className="text-white text-sm font-medium text-center">{data.awayTeam.shortName}</span>
                <FormBadges form={data.model.awayForm.form} />
              </div>
            </div>

            {/* Win / Draw / Win */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="size-4 text-green-400" />
                <span className="text-white text-sm font-semibold">Who wins</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
                <div className="bg-green-500" style={{ width: pct(outcome.homeWin) }} />
                <div className="bg-gray-500" style={{ width: pct(outcome.draw) }} />
                <div className="bg-blue-500" style={{ width: pct(outcome.awayWin) }} />
              </div>
              <div className="grid grid-cols-3 mt-2 text-center">
                {[
                  { label: data.homeTeam.tla || 'Home', p: outcome.homeWin, color: 'text-green-400' },
                  { label: 'Draw', p: outcome.draw, color: 'text-gray-400' },
                  { label: data.awayTeam.tla || 'Away', p: outcome.awayWin, color: 'text-blue-400' },
                ].map(({ label, p, color }) => (
                  <div key={label} className={p === maxOutcome ? 'opacity-100' : 'opacity-60'}>
                    <div className={`text-lg font-bold tabular-nums ${color}`}>{pct(p)}</div>
                    <div className="text-gray-500 text-xs">{label}{p === maxOutcome ? ' ★' : ''}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Over / Under */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="size-4 text-green-400" />
                <span className="text-white text-sm font-semibold">Goals — Over / Under</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(outcome.overUnder).map(([line, ou]) => {
                  const overLikely = ou.over >= ou.under;
                  return (
                    <div key={line} className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 text-center">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{line} goals</div>
                      <div className={`text-sm font-bold ${overLikely ? 'text-green-400' : 'text-gray-300'}`}>
                        O {pct(ou.over)}
                      </div>
                      <div className={`text-sm font-bold ${!overLikely ? 'text-green-400' : 'text-gray-300'}`}>
                        U {pct(ou.under)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Both teams to score:</span>
                  <span className="text-white font-semibold">Yes {pct(outcome.btts.yes)}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-400">No {pct(outcome.btts.no)}</span>
                </div>
              </div>
            </div>

            {/* Correct scores */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Goal className="size-4 text-green-400" />
                <span className="text-white text-sm font-semibold">Most likely correct scores</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {data.prediction.correctScores.map((cs, i) => (
                  <div
                    key={cs.score}
                    className={`rounded-lg p-2.5 text-center border ${
                      i === 0
                        ? 'bg-green-500/10 border-green-500/40'
                        : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <div className={`text-base font-bold tabular-nums ${i === 0 ? 'text-green-400' : 'text-white'}`}>
                      {cs.score}
                    </div>
                    <div className="text-gray-500 text-xs">{pct(cs.probability)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoning */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-300 text-sm leading-relaxed">{data.prediction.reasoning}</p>
              <p className="text-gray-600 text-xs mt-3">
                {data.model.type} · {data.disclaimer}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
