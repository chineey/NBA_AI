import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { Logo, PillTabs } from './components/DesignPrimitives';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamsGrid } from '@/app/components/TeamsGrid';
import { TeamRoster, type RosterPlayer } from '@/app/components/TeamRoster';
import { FootballApp } from '@/app/components/football/FootballApp';
import { BackButton } from '@/app/components/BackButton';

type Sport = 'nba' | 'football';
type Mode = 'players' | 'teams';
type TeamView = 'grid' | 'roster' | 'player';

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

  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState<Array<{ sport: string; a: string; b: string; s: string; m: string; live?: boolean }>>([]);
  const navDepthRef = useRef(0);

  const pushAppNav = (next: {
    sport: Sport;
    mode: Mode;
    teamView: TeamView;
    rosterAbbr: string;
    selectedPlayer: any;
  }) => {
    navDepthRef.current += 1;
    window.history.pushState({ appNav: next }, '');
  };

  useEffect(() => {
    if (!window.history.state?.appNav) {
      window.history.replaceState(
        { appNav: { sport: 'nba', mode: 'players', teamView: 'grid', rosterAbbr: '', selectedPlayer: null } },
        '',
      );
    }
    const onPopState = (e: PopStateEvent) => {
      const nav = e.state?.appNav;
      if (!nav) return;
      navDepthRef.current = Math.max(0, navDepthRef.current - 1);
      setSport(nav.sport ?? 'nba');
      setMode(nav.mode ?? 'players');
      setTeamView(nav.teamView ?? 'grid');
      setRosterAbbr(nav.rosterAbbr ?? '');
      setSelectedPlayer(nav.selectedPlayer ?? null);
      if (nav.selectedPlayer) {
        setPlayers([nav.selectedPlayer]);
      } else {
        setPlayers([]);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
      pushAppNav({ sport, mode: 'players', teamView: 'grid', rosterAbbr, selectedPlayer: data });
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
      const playerObj = {
        ...data,
        id: rosterPlayer.id || data.id,
        position: data.position && data.position !== '—' ? data.position : rosterPlayer.position,
        height: data.height || rosterPlayer.height,
        weight: data.weight || rosterPlayer.weight,
        jersey: data.jersey || rosterPlayer.number,
      };
      setSelectedPlayer(playerObj);
      setTeamView('player');
      pushAppNav({ sport, mode: 'teams', teamView: 'player', rosterAbbr, selectedPlayer: playerObj });
    } catch (error) {
      console.error('Failed to fetch player:', error);
      toast.error('Could not load player stats', { description: 'Please try again in a moment.' });
    }
    setLoading(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSearchQuery('');
    if (next === 'players') {
      setTeamView('grid');
      pushAppNav({ sport, mode: next, teamView: 'grid', rosterAbbr: '', selectedPlayer: null });
    } else {
      setSelectedPlayer(null);
      setPlayers([]);
      pushAppNav({ sport, mode: next, teamView: 'grid', rosterAbbr, selectedPlayer: null });
    }
  };

  const goBackOr = (fallback: () => void) => {
    if (navDepthRef.current > 0) {
      window.history.back();
    } else {
      fallback();
    }
  };

  const renderNbaContent = () => {
    if (loading) return <Loader label="Scouting player data..." />;

    if (mode === 'players' && selectedPlayer) {
      return (
        <div className="rise min-w-0">
          <BackButton
            onClick={() =>
              goBackOr(() => {
                setSelectedPlayer(null);
                setPlayers([]);
                setSearchQuery('');
              })
            }
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
        <div className="rise min-w-0">
          <BackButton onClick={() => goBackOr(() => setTeamView('roster'))} label="Back to roster" />
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
          <div className="mx-auto max-w-2xl py-6 sm:py-12 text-center rise">
            <h1 className="text-3xl font-bold sm:text-4xl md:text-5xl">
              Find any player&apos;s <span className="text-shine">edge</span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Search game logs, season averages and AI prop predictions.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchPlayer(searchQuery);
              }}
              className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-2.5"
            >
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players (e.g. Stephen Curry)…"
                className="panel flex-1 px-4 sm:px-5 py-3.5 sm:py-4 text-base outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="glow rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground transition hover:scale-[1.02] active:scale-95"
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
            onBack={() => goBackOr(() => setTeamView('grid'))}
          />
        ) : (
          <TeamsGrid
            onSelectTeam={(abbr) => {
              setRosterAbbr(abbr);
              setTeamView('roster');
              pushAppNav({ sport, mode: 'teams', teamView: 'roster', rosterAbbr: abbr, selectedPlayer: null });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3">
          <Logo />
          <PillTabs
            value={sport}
            onChange={(s) => {
              if (s === sport) return;
              setSport(s);
              pushAppNav({ sport: s, mode, teamView, rosterAbbr, selectedPlayer });
            }}
            items={[
              ['nba', '🏀 NBA'],
              ['football', '⚽ Football'],
            ]}
          />
          <button
            type="button"
            onClick={signOut}
            title={user.email ?? 'Sign out'}
            className="shrink-0 py-1.5 px-2 text-xs sm:text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
        {(() => {
          const visibleTicker = ticker.filter((t) => t.sport === sport);
          if (visibleTicker.length === 0) return null;
          return (
            <div className="overflow-hidden border-t bg-secondary/40 py-1.5 text-xs">
              <div className="marquee flex w-max gap-8 whitespace-nowrap">
                {[0, 1].flatMap((k) =>
                  visibleTicker.map((t, i) => (
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
          );
        })()}
      </header>

      <main key={sport} className="rise mx-auto max-w-6xl px-3 sm:px-4 py-5 sm:py-8">
        {sport === 'nba' ? renderNbaContent() : <FootballApp />}
      </main>
    </div>
  );
}
