import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './components/AuthPage';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TeamStatsColumn } from '@/app/components/TeamStatsColumn';
import { TeamPrediction } from '@/app/components/TeamPrediction';
import { TrendingUp, Search, BarChart3, User, Shield } from 'lucide-react';

type Mode = 'players' | 'teams';

export default function App() {
  const { user, signOut, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>('players');

  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);

  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

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

  const fetchTeam = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/team/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('Team not found');
      const data = await response.json();
      setTeams([data]);
      setSelectedTeam(data);
    } catch (error) {
      console.error('Failed to fetch team:', error);
    }
    setLoading(false);
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      mode === 'players' ? fetchPlayer(searchQuery) : fetchTeam(searchQuery);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setSearchQuery('');
    if (next === 'players') { setSelectedTeam(null); setTeams([]); }
    else { setSelectedPlayer(null); setPlayers([]); }
  };

  const hasData = mode === 'players' ? !!selectedPlayer : !!selectedTeam;
  const loadingLabel = mode === 'players' ? 'Scouting Player Data...' : 'Loading Team Data...';
  const placeholder = mode === 'players'
    ? 'Search player (e.g. Steph Curry)...'
    : 'Search team (e.g. Thunder, Lakers)...';

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="size-8 text-orange-500" />
            <h1 className="text-2xl text-white font-bold tracking-tight">NBA Betting Analysis</h1>
          </div>

          {/* Mode Toggle */}
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

          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <div className="size-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            <div className="text-orange-500 text-lg animate-pulse font-medium">{loadingLabel}</div>
          </div>
        ) : !hasData ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
            <div className="bg-gray-900 p-6 rounded-full border border-gray-800">
              <BarChart3 className="size-16 text-gray-700" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-3xl text-white font-bold">Ready to Analyze?</h2>
              <p className="text-gray-400 text-lg">
                {mode === 'players'
                  ? 'Search for an NBA player above to view their recent game stats, trends, and AI-powered performance predictions.'
                  : 'Search for an NBA team above (e.g. "Thunder", "LAL", "Golden State") to view team stats and AI-powered game predictions.'}
              </p>
            </div>
          </div>
        ) : mode === 'players' ? (
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-1">
              <TeamStatsColumn
                teams={teams}
                selectedTeam={selectedTeam}
                onSelectTeam={setSelectedTeam}
              />
            </div>
            <div className="lg:col-span-2">
              <TeamPrediction team={selectedTeam} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}