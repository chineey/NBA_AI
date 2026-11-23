import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { ProbBar } from '../DesignPrimitives';
import { MatchAnalysisModal } from './MatchAnalysisModal';

export interface PredictionMatch {
  matchId: number;
  utcDate: string;
  status: string;
  matchday?: number;
  competition: { code: string; name: string; emblem?: string };
  homeTeam: { id: number; name: string; short_name?: string; shortName?: string; crest: string; tla: string };
  awayTeam: { id: number; name: string; short_name?: string; shortName?: string; crest: string; tla: string };
  venue?: string;
  prediction: {
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    favoredCode: string;
    favoredLabel: string;
    predictedScore: string;
    confidence: 'high' | 'medium' | 'low';
    expectedGoals: { home: number; away: number };
    summaryReasoning: string;
    hasModelData: boolean;
    disclaimer?: string;
  };
}

const COMPETITION_PILLS = [
  { code: 'ALL', label: 'All' },
  { code: 'PL', label: 'Premier League' },
  { code: 'CL', label: 'Champions League' },
  { code: 'PD', label: 'La Liga' },
  { code: 'SA', label: 'Serie A' },
  { code: 'BL1', label: 'Bundesliga' },
];

function formatKickoff(utcIso: string) {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return utcIso;
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

type Props = {
  onSelectTeam?: (
    team: { id: number; name: string; shortName: string; tla: string; crest: string },
    competitionCode: string,
    competitionName: string,
  ) => void;
  onSelectCompetition?: (code: string, name: string) => void;
};

export function FootballPredictions({ onSelectTeam, onSelectCompetition }: Props) {
  const [selectedComp, setSelectedComp] = useState('ALL');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<PredictionMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/football/predictions?competition_code=${selectedComp}&limit=50`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load predictions');
        return r.json();
      })
      .then((data) => {
        setMatches(Array.isArray(data.predictions) ? data.predictions : []);
      })
      .catch((e) => {
        console.error(e);
        toast.error('Could not load predictions', { description: 'Please try again in a moment.' });
      })
      .finally(() => setLoading(false));
  }, [selectedComp, BASE]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter(
      (m) =>
        m.homeTeam.name.toLowerCase().includes(q) ||
        m.awayTeam.name.toLowerCase().includes(q) ||
        m.competition.name.toLowerCase().includes(q),
    );
  }, [matches, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {COMPETITION_PILLS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelectedComp(c.code)}
              className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
                selectedComp === c.code
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="panel w-full sm:w-56 px-3.5 py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel h-36 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          No upcoming match predictions found.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 stagger">
          {filtered.map((m) => {
            const homeName = m.homeTeam.short_name || m.homeTeam.shortName || m.homeTeam.name;
            const awayName = m.awayTeam.short_name || m.awayTeam.shortName || m.awayTeam.name;
            return (
              <button
                key={m.matchId}
                type="button"
                onClick={() => setSelectedMatchId(m.matchId)}
                className="panel panel-hover p-5 text-left"
              >
                <div className="mb-3 flex justify-between text-xs text-muted-foreground">
                  <span>{m.competition.name}</span>
                  <span className="num">{formatKickoff(m.utcDate)}</span>
                </div>
                <div className="mb-4 flex items-center justify-between gap-2 font-semibold">
                  <span className="truncate">{homeName}</span>
                  <span className="num text-xs text-muted-foreground">
                    {m.prediction.predictedScore || 'vs'}
                  </span>
                  <span className="truncate text-right">{awayName}</span>
                </div>
                <ProbBar
                  h={m.prediction.homeWinPct}
                  d={m.prediction.drawPct}
                  a={m.prediction.awayWinPct}
                />
              </button>
            );
          })}
        </div>
      )}

      {selectedMatchId !== null && (
        <MatchAnalysisModal
          matchId={selectedMatchId}
          onClose={() => setSelectedMatchId(null)}
          onSelectTeam={onSelectTeam}
          onSelectCompetition={onSelectCompetition}
        />
      )}
    </div>
  );
}
