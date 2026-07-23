import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamsGrid } from '@/app/components/TeamsGrid';
import { TeamRoster, type RosterPlayer } from '@/app/components/TeamRoster';
import { TeamPrediction } from '@/app/components/TeamPrediction';
import { FootballApp } from '@/app/components/football/FootballApp';
import { BackButton } from '@/app/components/BackButton';
import { AppSidebar } from '@/app/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/app/components/ui/sidebar';
import { Separator } from '@/app/components/ui/separator';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Search } from 'lucide-react';

type Sport = 'nba' | 'football';
type Mode = 'players' | 'teams';
type TeamView = 'grid' | 'roster' | 'player' | 'prediction';

const POPULAR_PLAYERS = [
  'LeBron James', 'Stephen Curry', 'Luka Doncic',
  'Giannis Antetokounmpo', 'Jayson Tatum', 'Shai Gilgeous-Alexander',
];

function BallLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
      <div className="relative">
        <span className="block text-4xl animate-bounce-ball drop-shadow-[0_8px_16px_rgba(249,115,22,0.35)]">🏀</span>
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-orange-500/20 rounded-full blur-[2px]" />
      </div>
      <div className="text-gray-400 text-sm font-medium tracking-wide animate-pulse">{label}</div>
    </div>
  );
}

export default function App() {
  const { user, signOut, loading: authLoading } = useAuth();
  const [sport, setSport] = useState<Sport>('nba');
  const [mode, setMode] = useState<Mode>('players');

  // Players mode
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Teams mode navigation
  const [teamView, setTeamView] = useState<TeamView>('grid');
  const [rosterAbbr, setRosterAbbr] = useState('');
  const [teamData, setTeamData] = useState<any>(null);

  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <BallLoader label="Warming up..." />
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
      toast.error('Player not found', { description: `No stats available for "${name}". Check the spelling and try again.` });
    }
    setLoading(false);
  };

  const fetchPlayerFromRoster = async (rosterPlayer: RosterPlayer) => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/player/${encodeURIComponent(rosterPlayer.name)}`);
      if (!response.ok) throw new Error('Player not found');
      const data = await response.json();
      // CommonPlayerInfo is often blocked on cloud servers; fill gaps from roster data.
      // Use rosterPlayer.id for the photo — CommonTeamRoster IDs are confirmed to work
      // with the NBA CDN, while Supabase game-log IDs sometimes don't.
      setSelectedPlayer({
        ...data,
        id: rosterPlayer.id || data.id,
        position: (data.position && data.position !== '—') ? data.position : rosterPlayer.position,
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

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') fetchPlayer(searchQuery);
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

  const renderTeamsContent = () => {
    if (loading) return <BallLoader label="Loading player data..." />;

    if (teamView === 'grid') {
      return (
        <TeamsGrid
          onSelectTeam={(abbr) => {
            setRosterAbbr(abbr);
            setTeamView('roster');
          }}
        />
      );
    }

    if (teamView === 'roster') {
      return (
        <TeamRoster
          abbr={rosterAbbr}
          onSelectPlayer={fetchPlayerFromRoster}
          onBack={() => setTeamView('grid')}
          onPredict={fetchTeamAndPredict}
        />
      );
    }

    if (teamView === 'prediction' && teamData) {
      return (
        <div className="space-y-4 animate-fade-up">
          <BackButton onClick={() => setTeamView('roster')} label="Back to roster" />
          <TeamPrediction team={teamData} />
        </div>
      );
    }

    // player view
    return (
      <div className="space-y-4 animate-fade-up">
        <BackButton onClick={() => setTeamView('roster')} label="Back to roster" />
        {selectedPlayer && <StatPrediction player={selectedPlayer} />}
      </div>
    );
  };

  const renderPlayersContent = () => {
    if (loading) return <BallLoader label="Scouting player data..." />;

    if (!selectedPlayer) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-up">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-2xl animate-[glow-pulse_3s_ease-in-out_infinite]" />
            <div className="relative bg-gradient-to-b from-gray-800/80 to-gray-900 p-7 rounded-3xl border border-white/10 shadow-2xl shadow-orange-500/10">
              <Search className="size-14 text-orange-400/90" strokeWidth={1.5} />
            </div>
          </div>
          <div className="space-y-3 max-w-lg">
            <h2 className="font-display text-3xl sm:text-4xl text-white font-bold tracking-tight">
              Who are we scouting <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">tonight?</span>
            </h2>
            <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
              Search any NBA player to break down their recent form, matchup trends, and AI-powered projections for the next game.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-xl stagger-children">
            {POPULAR_PLAYERS.map((name, i) => (
              <Button
                key={name}
                variant="outline"
                style={{ ['--i' as any]: i }}
                onClick={() => { setSearchQuery(name); fetchPlayer(name); }}
                className="rounded-full border-white/10 bg-white/[0.04] text-gray-300 hover:-translate-y-0.5 hover:border-orange-500/60 hover:bg-orange-500/10 hover:text-white transition-all duration-200"
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 animate-fade-up">
        <BackButton
          onClick={() => { setSelectedPlayer(null); setPlayers([]); setSearchQuery(''); }}
          label="Back to search"
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <PlayerStatsColumn
              players={players}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
          <div className="lg:col-span-2">
            <StatPrediction player={selectedPlayer} />
          </div>
        </div>
      </div>
    );
  };

  const isNba = sport === 'nba';

  return (
    <SidebarProvider className="min-h-svh bg-gray-950">
      {/* Ambient background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[140px] opacity-[0.07] transition-colors duration-700 ${
            isNba ? 'bg-orange-500' : 'bg-green-500'
          }`}
        />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full blur-[160px] opacity-[0.04] bg-indigo-500" />
      </div>

      <AppSidebar
        sport={sport}
        setSport={setSport}
        mode={mode}
        switchMode={switchMode}
        userEmail={user?.email}
        onSignOut={signOut}
      />

      <SidebarInset className="relative z-10 bg-transparent">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-gray-950/75 backdrop-blur-xl border-b border-white/[0.06]">
          <div className="px-4 sm:px-6 py-3.5 flex flex-wrap justify-between items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="text-gray-400 hover:text-white hover:bg-white/[0.06]" />
              <Separator orientation="vertical" className="h-5 bg-white/[0.08]" />
              <h1 className="font-display text-base sm:text-lg text-white font-bold tracking-tight leading-none truncate">
                {isNba ? 'NBA Analysis' : 'Football Analysis'}
              </h1>
            </div>

            {/* Search bar — NBA players mode only */}
            {isNba && mode === 'players' && (
              <div className="relative w-full md:w-80 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-orange-400 transition-colors z-10" />
                <Input
                  type="text"
                  placeholder="Search player (e.g. Steph Curry)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full rounded-full border-white/[0.08] bg-white/[0.04] pl-10 pr-4 py-2.5 h-auto text-sm text-white placeholder:text-gray-500 focus-visible:ring-orange-500/40 focus-visible:border-orange-500/50 focus-visible:bg-gray-900"
                />
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="relative px-4 sm:px-6 py-8">
          {sport === 'football' ? (
            <FootballApp />
          ) : (
            mode === 'players' ? renderPlayersContent() : renderTeamsContent()
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
