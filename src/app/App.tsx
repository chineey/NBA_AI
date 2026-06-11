import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamsGrid } from '@/app/components/TeamsGrid';
import { TeamRoster, type RosterPlayer } from '@/app/components/TeamRoster';
import { TeamPrediction } from '@/app/components/TeamPrediction';
import { FootballApp } from '@/app/components/football/FootballApp';
import { TrendingUp, Search, User, Shield, ArrowLeft, LogOut, Sparkles } from 'lucide-react';

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
          <button
            onClick={() => setTeamView('roster')}
            className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to roster
          </button>
          <TeamPrediction team={teamData} />
        </div>
      );
    }

    // player view
    return (
      <div className="space-y-4 animate-fade-up">
        <button
          onClick={() => setTeamView('roster')}
          className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to roster
        </button>
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
              <button
                key={name}
                style={{ ['--i' as any]: i }}
                onClick={() => { setSearchQuery(name); fetchPlayer(name); }}
                className="px-4 py-2 rounded-full text-sm text-gray-300 bg-white/[0.04] border border-white/10 hover:border-orange-500/60 hover:text-white hover:bg-orange-500/10 transition-all duration-200 hover:-translate-y-0.5"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-up">
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
    );
  };

  const isNba = sport === 'nba';

  return (
    <div className="min-h-screen bg-gray-950 relative">
      {/* Ambient background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-[140px] opacity-[0.07] transition-colors duration-700 ${
            isNba ? 'bg-orange-500' : 'bg-green-500'
          }`}
        />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full blur-[160px] opacity-[0.04] bg-indigo-500" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-950/75 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="container mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap justify-between items-center gap-x-6 gap-y-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className={`relative flex items-center justify-center size-10 rounded-xl shadow-lg transition-all duration-500 ${
                isNba
                  ? 'bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/30'
                  : 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30'
              }`}
            >
              <TrendingUp className="size-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="font-display text-lg sm:text-xl text-white font-bold tracking-tight leading-none">
                {isNba ? 'NBA Analysis' : 'Football Analysis'}
              </h1>
              <div className="flex items-center gap-1 mt-1">
                <Sparkles className={`size-3 ${isNba ? 'text-orange-400' : 'text-green-400'}`} />
                <span className="text-[11px] text-gray-500 font-medium tracking-wide uppercase">AI-powered predictions</span>
              </div>
            </div>
          </div>

          {/* Sport Toggle */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full p-1">
            <button
              onClick={() => setSport('nba')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                isNba
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🏀 NBA
            </button>
            <button
              onClick={() => setSport('football')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                !isNba
                  ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-lg shadow-green-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⚽ Football
            </button>
          </div>

          {/* NBA sub-mode toggle — only shown for NBA */}
          {isNba && (
            <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-full p-1">
              <button
                onClick={() => switchMode('players')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  mode === 'players'
                    ? 'bg-white/10 text-white shadow-inner border border-white/10'
                    : 'text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                <User className="size-3.5" />
                Players
              </button>
              <button
                onClick={() => switchMode('teams')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  mode === 'teams'
                    ? 'bg-white/10 text-white shadow-inner border border-white/10'
                    : 'text-gray-400 hover:text-white border border-transparent'
                }`}
              >
                <Shield className="size-3.5" />
                Teams
              </button>
            </div>
          )}

          {/* User + Sign Out */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
              <span className={`size-1.5 rounded-full ${isNba ? 'bg-orange-400' : 'bg-green-400'}`} />
              <span className="text-gray-400 text-xs font-medium max-w-[160px] truncate">{user?.email}</span>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-red-400/90 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300 transition-all"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          {/* Search bar — NBA players mode only */}
          {isNba && mode === 'players' && (
            <div className="relative w-full md:w-80 group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-gray-500 group-focus-within:text-orange-400 transition-colors" />
              <input
                type="text"
                placeholder="Search player (e.g. Steph Curry)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 focus:bg-gray-900 transition-all"
              />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="relative container mx-auto px-4 sm:px-6 py-8">
        {sport === 'football' ? (
          <FootballApp />
        ) : (
          mode === 'players' ? renderPlayersContent() : renderTeamsContent()
        )}
      </div>
    </div>
  );
}
