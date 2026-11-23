import { useState, useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { ProbBar, TextAvatar } from '../DesignPrimitives';
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
  { code: 'FL1', label: 'Ligue 1' },
  { code: 'DED', label: 'Eredivisie' },
  { code: 'PPL', label: 'Primeira Liga' },
  { code: 'ELC', label: 'Championship' },
  { code: 'BSA', label: 'Brasileirão' },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar flex flex-nowrap gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
          {COMPETITION_PILLS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setSelectedComp(c.code)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
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
          className="panel w-full shrink-0 sm:w-56 px-3.5 py-2 sm:py-1.5 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="grid gap-3.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel h-40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          No upcoming match predictions found.
        </div>
      ) : (
        <div className="grid gap-3.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
          {filtered.map((m) => {
            const homeName = m.homeTeam.short_name || m.homeTeam.shortName || m.homeTeam.name;
            const awayName = m.awayTeam.short_name || m.awayTeam.shortName || m.awayTeam.name;
            const confColor =
              m.prediction.confidence === 'high'
                ? 'bg-primary/15 text-primary'
                : m.prediction.confidence === 'medium'
                ? 'bg-accent/15 text-accent'
                : 'bg-secondary text-muted-foreground';
            return (
              <button
                key={m.matchId}
                type="button"
                onClick={() => setSelectedMatchId(m.matchId)}
                className="panel panel-hover group flex flex-col justify-between p-4 sm:p-5 text-left"
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2 text-[11px] sm:text-xs text-muted-foreground">
                    <span className="truncate font-medium">{m.competition.name}</span>
                    <span className="num shrink-0">{formatKickoff(m.utcDate)}</span>
                  </div>

                  <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      {m.homeTeam.crest ? (
                        <img
                          src={m.homeTeam.crest}
                          alt={homeName}
                          className="size-6 sm:size-7 shrink-0 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <TextAvatar label={homeName} />
                      )}
                      <span className="truncate text-sm sm:text-base font-semibold">{homeName}</span>
                    </div>

                    <span className="num rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                      {m.prediction.predictedScore || 'vs'}
                    </span>

                    <div className="flex min-w-0 items-center justify-end gap-2">
                      <span className="truncate text-right text-sm sm:text-base font-semibold">{awayName}</span>
                      {m.awayTeam.crest ? (
                        <img
                          src={m.awayTeam.crest}
                          alt={awayName}
                          className="size-6 sm:size-7 shrink-0 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <TextAvatar label={awayName} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <ProbBar
                    h={m.prediction.homeWinPct}
                    d={m.prediction.drawPct}
                    a={m.prediction.awayWinPct}
                  />
                  <div className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${confColor}`}>
                      {m.prediction.confidence} confidence
                    </span>
                    <span className="inline-flex items-center gap-0.5 font-medium text-foreground/70 group-hover:text-primary transition-colors">
                      Details <ChevronRight className="size-3.5" />
                    </span>
                  </div>
                </div>
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
