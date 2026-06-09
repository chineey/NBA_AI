import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamsGrid } from '@/app/components/TeamsGrid';
import { TeamRoster, type RosterPlayer } from '@/app/components/TeamRoster';
import { TeamPrediction } from '@/app/components/TeamPrediction';
import { FootballApp } from '@/app/components/football/FootballApp';
import { TrendingUp, Search, User, Shield, ArrowLeft } from 'lucide-react';

type Sport = 'nba' | 'football';
type Mode = 'players' | 'teams';
type TeamView = 'grid' | 'roster' | 'player' | 'prediction';

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
        <div className="text-white">Loading...</div>
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
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="size-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <div className="text-orange-500 text-lg animate-pulse font-medium">Loading Player Data...</div>
        </div>
      );
    }

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
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
          <button
            onClick={() => setTeamView('roster')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="size-4" />
            Back to roster
          </button>
          <TeamPrediction team={teamData} />
        </div>
      );
    }

    // player view
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
        <button
          onClick={() => setTeamView('roster')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="size-4" />
          Back to roster
        </button>
        {selectedPlayer && <StatPrediction player={selectedPlayer} />}
      </div>
    );
  };

  const renderPlayersContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="size-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <div className="text-orange-500 text-lg animate-pulse font-medium">Scouting Player Data...</div>
        </div>
      );
    }

    if (!selectedPlayer) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
          <div className="bg-gray-900 p-6 rounded-full border border-gray-800">
            <Search className="size-16 text-gray-700" />
          </div>
          <div className="space-y-2 max-w-md">
            <h2 className="text-3xl text-white font-bold">Ready to Analyze?</h2>
            <p className="text-gray-400 text-lg">
              Search for an NBA player above to view their recent game stats, trends, and AI-powered performance predictions.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

  const accentClass = sport === 'football' ? 'text-green-500' : 'text-orange-500';

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className={`size-8 ${accentClass}`} />
            <h1 className="text-2xl text-white font-bold tracking-tight">
              {sport === 'football' ? 'Football Analysis' : 'NBA Betting Analysis'}
            </h1>
          </div>

          {/* Sport Toggle */}
          <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
            <button
              onClick={() => setSport('nba')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sport === 'nba' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              🏀 NBA
            </button>
            <button
              onClick={() => setSport('football')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sport === 'football' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              ⚽ Football
            </button>
          </div>

          {/* NBA sub-mode toggle — only shown for NBA */}
          {sport === 'nba' && (
            <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
              <button
                onClick={() => switchMode('players')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === 'players' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <User className="size-3.5" />
                Players
              </button>
              <button
                onClick={() => switchMode('teams')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === 'teams' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Shield className="size-3.5" />
                Teams
              </button>
            </div>
          )}

          {/* User + Sign Out */}
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>

          {/* Search bar — NBA players mode only */}
          {sport === 'nba' && mode === 'players' && (
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search player (e.g. Steph Curry)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
              />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {sport === 'football' ? (
          <FootballApp />
        ) : (
          mode === 'players' ? renderPlayersContent() : renderTeamsContent()
        )}
      </div>
    </div>
  );
}
