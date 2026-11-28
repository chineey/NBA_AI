import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { MatchAnalysisModal } from './MatchAnalysisModal';

type Competition = { id: number | null; code: string; name: string; emblem: string; area: string };
type FixtureTeam = { id: number; name: string; shortName: string; crest: string; tla: string };

type Fixture = {
  matchId: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  competition: { code: string; name: string };
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  score: { home: number; away: number } | null;
};

function formatFixtureDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

type Props = {
  onSelectTeam: (team: FixtureTeam, competitionCode: string, competitionName: string) => void;
  onSelectCompetition: (code: string, name: string) => void;
};

export function FootballFixtures({ onSelectTeam, onSelectCompetition }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionCode, setCompetitionCode] = useState('ALL');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(true);
  const [openMatchId, setOpenMatchId] = useState<number | null>(null);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    fetch(`${BASE}/football/competitions`)
      .then((r) => r.json())
      .then(setCompetitions)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load competitions', { description: 'Please refresh and try again.' });
      });
  }, [BASE]);

  useEffect(() => {
    setLoadingFixtures(true);
    fetch(`${BASE}/football/fixtures?competition_code=${competitionCode}&when=results`)
      .then((r) => r.json())
      .then(setFixtures)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load results', { description: 'Please try again in a moment.' });
      })
      .finally(() => setLoadingFixtures(false));
  }, [competitionCode, BASE]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg sm:text-xl font-bold">Past Results</h2>
        <select
          value={competitionCode}
          onChange={(e) => setCompetitionCode(e.target.value)}
          className="panel w-full sm:w-auto px-3.5 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="ALL">All Competitions</option>
          {competitions.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loadingFixtures ? (
        <div className="panel h-64 animate-pulse" />
      ) : fixtures.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">No past results found.</div>
      ) : (
        <div className="panel overflow-hidden stagger">
          {fixtures.map((f) => {
            const hasScore = f.score !== null;
            const homeName = f.homeTeam.shortName || f.homeTeam.name;
            const awayName = f.awayTeam.shortName || f.awayTeam.name;
            return (
              <button
                key={f.matchId}
                type="button"
                onClick={() => setOpenMatchId(f.matchId)}
                className="grid w-full grid-cols-[54px_1fr_auto_1fr] sm:grid-cols-[130px_1fr_auto_1fr] items-center gap-2 sm:gap-4 border-b px-3 sm:px-5 py-3.5 sm:py-4 text-xs sm:text-sm transition-colors last:border-0 hover:bg-secondary"
              >
                <div className="flex flex-col text-left">
                  <span className="num text-[11px] sm:text-xs text-muted-foreground">
                    {formatFixtureDate(f.utcDate)}
                  </span>
                  {competitionCode === 'ALL' && (
                    <span className="truncate text-[10px] font-medium text-muted-foreground/75">
                      {f.competition.code}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 items-center justify-end gap-2">
                  <span className="truncate text-right font-medium">{homeName}</span>
                  {f.homeTeam.crest && (
                    <img
                      src={f.homeTeam.crest}
                      alt={homeName}
                      className="hidden sm:block size-5 shrink-0 object-contain"
                      loading="lazy"
                    />
                  )}
                </div>
                <span
                  className={`num rounded-md px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-semibold ${
                    hasScore ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {hasScore ? `${f.score!.home}–${f.score!.away}` : '–'}
                </span>
                <div className="flex min-w-0 items-center justify-start gap-2">
                  {f.awayTeam.crest && (
                    <img
                      src={f.awayTeam.crest}
                      alt={awayName}
                      className="hidden sm:block size-5 shrink-0 object-contain"
                      loading="lazy"
                    />
                  )}
                  <span className="truncate text-left font-medium">{awayName}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openMatchId !== null && (
        <MatchAnalysisModal
          matchId={openMatchId}
          onClose={() => setOpenMatchId(null)}
          onSelectTeam={onSelectTeam}
          onSelectCompetition={onSelectCompetition}
        />
      )}
    </div>
  );
}
