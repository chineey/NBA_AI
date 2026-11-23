import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PillTabs, ProbBar, StatBox, TextAvatar } from '../DesignPrimitives';

interface TeamInfo {
  id: number;
  name: string;
  short_name?: string;
  shortName?: string;
  crest: string;
  tla: string;
}

interface DetailedAnalysis {
  matchId: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string };
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  venue?: string;
  prediction: {
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    favoredLabel: string;
    predictedScore: string;
    confidence: string;
    expectedGoals: { home: number; away: number };
    summaryReasoning: string;
  };
  detailedReasoning: {
    recentForm: {
      home: { teamName: string; formString: string; pointsLast5: number; trend: string };
      away: { teamName: string; formString: string; pointsLast5: number; trend: string };
    };
    homeAwayPerformance: {
      homeTeamAtHome: { record: string; goalsForAvg: number; cleanSheetRate: string };
      awayTeamAway: { record: string; goalsForAvg: number; cleanSheetRate: string };
      insight: string;
    };
    headToHead: {
      totalMeetings: number;
      recentClashes: { date: string; home: string; away: string; score: string; comp: string }[];
      summary: string;
    };
    injuriesAndAvailability: {
      home: { name: string; position: string; status: string; reason: string }[];
      away: { name: string; position: string; status: string; reason: string }[];
    };
  };
}

interface Props {
  matchId: number;
  onClose: () => void;
  onSelectTeam?: (team: TeamInfo & { shortName: string }, competitionCode: string, competitionName: string) => void;
  onSelectCompetition?: (code: string, name: string) => void;
}

export function MatchAnalysisModal({ matchId, onClose, onSelectTeam }: Props) {
  const [data, setData] = useState<DetailedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'form' | 'h2h' | 'injuries'>('overview');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE}/football/matches/${matchId}/analysis`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((b) => {
            throw new Error(b.detail ?? `Error ${r.status}`);
          });
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        setError(e.message);
        toast.error('Could not load match analysis', { description: e.message });
      })
      .finally(() => setLoading(false));
  }, [matchId, BASE]);

  const homeName = data ? data.homeTeam.short_name || data.homeTeam.shortName || data.homeTeam.name : '';
  const awayName = data ? data.awayTeam.short_name || data.awayTeam.shortName || data.awayTeam.name : '';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-3 sm:p-4 backdrop-blur overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="panel rise glow w-full max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 my-4 sm:my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="truncate">Match analysis · {data?.competition.name ?? 'Loading…'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-secondary hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="space-y-4 py-10">
            <div className="panel h-20 animate-pulse" />
            <div className="panel h-24 animate-pulse" />
          </div>
        ) : error || !data ? (
          <div className="py-10 text-center text-sm text-destructive">{error || 'Analysis unavailable'}</div>
        ) : (
          <>
            <div className="my-5 sm:my-6 grid grid-cols-[1fr_auto_1fr] items-center text-center gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  onSelectTeam?.(
                    { ...data.homeTeam, shortName: homeName },
                    data.competition.code,
                    data.competition.name,
                  );
                  onClose();
                }}
                className="flex min-w-0 flex-col items-center hover:text-primary transition-colors"
              >
                {data.homeTeam.crest ? (
                  <img src={data.homeTeam.crest} alt={homeName} className="size-10 sm:size-12 object-contain" />
                ) : (
                  <TextAvatar label={homeName} big />
                )}
                <div className="mt-2 w-full truncate font-semibold text-xs sm:text-sm">{homeName}</div>
              </button>

              <div className="num text-2xl sm:text-3xl font-bold">{data.prediction.predictedScore || 'vs'}</div>

              <button
                type="button"
                onClick={() => {
                  onSelectTeam?.(
                    { ...data.awayTeam, shortName: awayName },
                    data.competition.code,
                    data.competition.name,
                  );
                  onClose();
                }}
                className="flex min-w-0 flex-col items-center hover:text-primary transition-colors"
              >
                {data.awayTeam.crest ? (
                  <img src={data.awayTeam.crest} alt={awayName} className="size-10 sm:size-12 object-contain" />
                ) : (
                  <TextAvatar label={awayName} big />
                )}
                <div className="mt-2 w-full truncate font-semibold text-xs sm:text-sm">{awayName}</div>
              </button>
            </div>

            <ProbBar
              h={data.prediction.homeWinPct}
              d={data.prediction.drawPct}
              a={data.prediction.awayWinPct}
            />

            <div className="mt-6 grid grid-cols-3 gap-3 stagger">
              <StatBox label="xG home" value={data.prediction.expectedGoals.home.toFixed(2)} />
              <StatBox label="xG away" value={data.prediction.expectedGoals.away.toFixed(2)} />
              <StatBox label="Confidence" value={data.prediction.confidence.toUpperCase()} accent />
            </div>

            <div className="mt-5">
              <PillTabs
                value={tab}
                onChange={setTab}
                items={[
                  ['overview', 'Overview'],
                  ['form', 'Form'],
                  ['h2h', 'H2H'],
                  ['injuries', 'Injuries'],
                ]}
              />
            </div>

            <div className="mt-4 space-y-3 text-sm">
              {tab === 'overview' && (
                <div className="rounded-lg bg-secondary p-4">
                  <span className="font-semibold text-primary">Model pick ({data.prediction.favoredLabel}): </span>
                  {data.prediction.summaryReasoning}
                </div>
              )}

              {tab === 'form' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-secondary p-3">
                      <div className="font-semibold">{homeName} (Home)</div>
                      <div className="num text-xs text-muted-foreground mt-1">
                        Form: {data.detailedReasoning.recentForm.home.formString} ·{' '}
                        {data.detailedReasoning.recentForm.home.pointsLast5} pts L5
                      </div>
                      <div className="num text-xs text-muted-foreground mt-1">
                        Home record: {data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.record}
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary p-3">
                      <div className="font-semibold">{awayName} (Away)</div>
                      <div className="num text-xs text-muted-foreground mt-1">
                        Form: {data.detailedReasoning.recentForm.away.formString} ·{' '}
                        {data.detailedReasoning.recentForm.away.pointsLast5} pts L5
                      </div>
                      <div className="num text-xs text-muted-foreground mt-1">
                        Away record: {data.detailedReasoning.homeAwayPerformance.awayTeamAway.record}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                    {data.detailedReasoning.homeAwayPerformance.insight}
                  </div>
                </div>
              )}

              {tab === 'h2h' && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{data.detailedReasoning.headToHead.summary}</p>
                  {data.detailedReasoning.headToHead.recentClashes.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-xs">
                      <span className="num text-muted-foreground">{c.date}</span>
                      <span>
                        {c.home} <strong className="num text-primary">{c.score}</strong> {c.away}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'injuries' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-secondary p-3 space-y-1.5">
                    <div className="font-semibold">{homeName}</div>
                    {data.detailedReasoning.injuriesAndAvailability.home.length === 0 ? (
                      <div className="text-muted-foreground">No reported injuries</div>
                    ) : (
                      data.detailedReasoning.injuriesAndAvailability.home.map((p, i) => (
                        <div key={i}>
                          <span className="font-medium">{p.name}</span>{' '}
                          <span className="text-destructive">({p.status})</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="rounded-lg bg-secondary p-3 space-y-1.5">
                    <div className="font-semibold">{awayName}</div>
                    {data.detailedReasoning.injuriesAndAvailability.away.length === 0 ? (
                      <div className="text-muted-foreground">No reported injuries</div>
                    ) : (
                      data.detailedReasoning.injuriesAndAvailability.away.map((p, i) => (
                        <div key={i}>
                          <span className="font-medium">{p.name}</span>{' '}
                          <span className="text-destructive">({p.status})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
