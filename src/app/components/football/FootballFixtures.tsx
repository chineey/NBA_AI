import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { PillTabs } from '../DesignPrimitives';
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

type When = 'upcoming' | 'results';

function formatFixtureDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type Props = {
  onSelectTeam: (team: FixtureTeam, competitionCode: string, competitionName: string) => void;
  onSelectCompetition: (code: string, name: string) => void;
};

export function FootballFixtures({ onSelectTeam, onSelectCompetition }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionCode, setCompetitionCode] = useState('ALL');
  const [when, setWhen] = useState<When>('upcoming');
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
    fetch(`${BASE}/football/fixtures?competition_code=${competitionCode}&when=${when}`)
      .then((r) => r.json())
      .then(setFixtures)
      .catch((e) => {
        console.error(e);
        toast.error('Could not load fixtures', { description: 'Please try again in a moment.' });
      })
      .finally(() => setLoadingFixtures(false));
  }, [competitionCode, when, BASE]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs
          value={when}
          onChange={setWhen}
          items={[
            ['upcoming', 'Upcoming'],
            ['results', 'Results'],
          ]}
        />

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
        <div className="panel p-8 text-center text-sm text-muted-foreground">No fixtures found.</div>
      ) : (
        <div className="panel overflow-hidden stagger">
          {fixtures.map((f) => {
            const hasScore = f.score !== null;
            return (
              <button
                key={f.matchId}
                type="button"
                onClick={() => setOpenMatchId(f.matchId)}
                className="grid w-full grid-cols-[54px_1fr_auto_1fr] sm:grid-cols-[80px_1fr_auto_1fr] items-center gap-2 sm:gap-4 border-b px-3 sm:px-5 py-3.5 sm:py-4 text-xs sm:text-sm transition-colors last:border-0 hover:bg-secondary"
              >
                <span className="num text-left text-[11px] sm:text-xs text-muted-foreground">
                  {formatFixtureDate(f.utcDate)}
                </span>
                <span className="truncate text-right font-medium">
                  {f.homeTeam.shortName || f.homeTeam.name}
                </span>
                <span
                  className={`num rounded-md px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold ${
                    hasScore ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {hasScore ? `${f.score!.home}–${f.score!.away}` : '–'}
                </span>
                <span className="truncate text-left font-medium">
                  {f.awayTeam.shortName || f.awayTeam.name}
                </span>
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
