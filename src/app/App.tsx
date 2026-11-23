import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Logo, PillTabs } from './components/DesignPrimitives';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamsGrid } from '@/app/components/TeamsGrid';
import { TeamRoster, type RosterPlayer } from '@/app/components/TeamRoster';
import { TeamPrediction } from '@/app/components/TeamPrediction';
import { FootballApp } from '@/app/components/football/FootballApp';
import { BackButton } from '@/app/components/BackButton';

type Sport = 'nba' | 'football';
type Mode = 'players' | 'teams';
type TeamView = 'grid' | 'roster' | 'player' | 'prediction';

const POPULAR_PLAYERS = [
  'LeBron James',
  'Stephen Curry',
  'Nikola Jokic',
  'Giannis Antetokounmpo',
  'Luka Doncic',
  'Jayson Tatum',
  'Shai Gilgeous-Alexander',
];

function Loader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default function App() {
  const { user, signOut, loading: authLoading } = useAuth();
  const [sport, setSport] = useState<Sport>('nba');
  const [mode, setMode] = useState<Mode>('players');

  // NBA Players mode
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // NBA Teams mode
  const [teamView, setTeamView] = useState<TeamView>('grid');
  const [rosterAbbr, setRosterAbbr] = useState('');
  const [teamData, setTeamData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState<Array<{ sport: string; a: string; b: string; s: string; m: string; live?: boolean }>>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadTicker = () => {
      fetch(`${import.meta.env.VITE_API_URL}/ticker`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (active && Array.isArray(data)) setTicker(data);
        })
        .catch(() => {});
    };
    loadTicker();
    const id = setInterval(loadTicker, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader label="Warming up..." />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const fetchPlayer = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/player/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('Player not found');
      const data = await response.json();
      setPlayers([data]);
      setSelectedPlayer(data);
    } catch (error) {
      console.error('Failed to fetch player:', error);
      toast.error('Player not found', {
        description: `No stats available for "${name}". Check the spelling and try again.`,
      });
    }
    setLoading(false);
  };

  const fetchPlayerFromRoster = async (rosterPlayer: RosterPlayer) => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/player/${encodeURIComponent(rosterPlayer.name)}`);
      if (!response.ok) throw new Error('Player not found');
      const data = await response.json();
      setSelectedPlayer({
        ...data,
        id: rosterPlayer.id || data.id,
        position: data.position && data.position !== '—' ? data.position : rosterPlayer.position,
        height: data.height || rosterPlayer.height,
        weight: data.weight || rosterPlayer.weight,
        jersey: data.jersey || rosterPlayer.number,
      });
      setTeamView('player');
    } catch (error) {
      console.error('Failed to fetch player:', error);
      toast.error('Could not load player stats', { description: 'Please try again in a moment.' });
    }
    setLoading(false);
  };

  const fetchTeamAndPredict = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/team/${rosterAbbr}`);
      if (!response.ok) throw new Error('Team not found');
      const data = await response.json();
      setTeamData(data);
      setTeamView('prediction');
    } catch (error) {
      console.error('Failed to fetch team data:', error);
      toast.error('Could not load team data', { description: 'Please try again in a moment.' });
    }
    setLoading(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSearchQuery('');
    if (next === 'players') {
      setTeamView('grid');
    } else {
      setSelectedPlayer(null);
      setPlayers([]);
    }
  };

  const renderNbaContent = () => {
    if (loading) return <Loader label="Scouting player data..." />;

    if (mode === 'players' && selectedPlayer) {
      return (
        <div className="rise">
          <BackButton
            onClick={() => {
              setSelectedPlayer(null);
              setPlayers([]);
              setSearchQuery('');
            }}
            label="Back to search"
          />
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <PlayerStatsColumn
              players={players}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <StatPrediction player={selectedPlayer} />
          </div>
        </div>
      );
    }

    if (mode === 'teams' && teamView === 'player' && selectedPlayer) {
      return (
        <div className="rise">
          <BackButton onClick={() => setTeamView('roster')} label="Back to roster" />
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <PlayerStatsColumn
              players={[selectedPlayer]}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              searchQuery=""
              onSearchChange={() => {}}
            />
            <StatPrediction player={selectedPlayer} />
          </div>
        </div>
      );
    }

    if (mode === 'teams' && teamView === 'prediction' && teamData) {
      return (
        <div className="rise">
          <BackButton onClick={() => setTeamView('roster')} label="Back to roster" />
          <TeamPrediction team={teamData} />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PillTabs
          value={mode}
          onChange={switchMode}
          items={[
            ['players', 'Players'],
            ['teams', 'Teams'],
          ]}
        />

        {mode === 'players' ? (
          <div className="mx-auto max-w-2xl py-12 text-center rise">
            <h1 className="text-4xl font-bold md:text-5xl">
              Find any player&apos;s <span className="text-shine">edge</span>
            </h1>
            <p className="mt-3 text-muted-foreground">
              Search game logs, season averages and AI prop predictions.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchPlayer(searchQuery);
              }}
              className="mt-8 flex gap-2"
            >
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players (e.g. Stephen Curry)…"
                className="panel flex-1 px-5 py-4 text-base outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="glow rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95"
              >
                Search
              </button>
            </form>
            <div className="mt-8 text-xs uppercase tracking-wider text-muted-foreground">Popular</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2 stagger">
              {POPULAR_PLAYERS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSearchQuery(name);
                    fetchPlayer(name);
                  }}
                  className="rounded-full border px-4 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : teamView === 'roster' ? (
          <TeamRoster
            abbr={rosterAbbr}
            onSelectPlayer={fetchPlayerFromRoster}
            onBack={() => setTeamView('grid')}
            onPredict={fetchTeamAndPredict}
          />
        ) : (
          <TeamsGrid
            onSelectTeam={(abbr) => {
              setRosterAbbr(abbr);
              setTeamView('roster');
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <PillTabs
            value={sport}
            onChange={(s) => setSport(s)}
            items={[
              ['nba', '🏀 NBA'],
              ['football', '⚽ Football'],
            ]}
          />
          <button
            type="button"
            onClick={signOut}
            title={user.email ?? 'Sign out'}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
        {ticker.length > 0 && (
          <div className="overflow-hidden border-t bg-secondary/40 py-1.5 text-xs">
            <div className="marquee flex w-max gap-8 whitespace-nowrap">
              {[0, 1].flatMap((k) =>
                ticker.map((t, i) => (
                  <span key={`${k}-${i}`} className="flex items-center gap-2 text-muted-foreground">
                    {t.live && <span className="live-dot size-1.5 rounded-full bg-destructive" />}
                    <span className="text-foreground font-medium">{t.a}</span>
                    <span className="num font-semibold text-primary">{t.s}</span>
                    <span className="text-foreground font-medium">{t.b}</span>
                    <span>{t.m}</span>
                  </span>
                )),
              )}
            </div>
          </div>
        )}
      </header>

      <main key={sport} className="rise mx-auto max-w-6xl px-4 py-8">
        {sport === 'nba' ? renderNbaContent() : <FootballApp />}
      </main>
    </div>
  );
}
