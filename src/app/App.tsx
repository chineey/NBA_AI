import { useState } from 'react';
import { PlayerStatsColumn } from '@/app/components/PlayerStatsColumn';
import { StatPrediction } from '@/app/components/StatPrediction';
import { TrendingUp, Search, BarChart3 } from 'lucide-react';

export default function App() {
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState(''); // 1. Start with empty search
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 2. Removed the useEffect hook entirely to prevent auto-fetching

  const fetchPlayer = async (name: string) => {
    if (!name.trim()) return; // Don't fetch if search is empty

    setLoading(true);
    try {
      const encodedName = encodeURIComponent(name); 
      const response = await fetch(`https://nba-ai.onrender.com/player/${encodedName}`);
      //const response = await fetch(`http://127.0.0.1:8000/player/${encodedName}`);
      
      if (!response.ok) {
        throw new Error('Player not found');
      }

      const data = await response.json();
      
      setPlayers([data]); 
      setSelectedPlayer(data);
    } catch (error) {
      console.error("Failed to fetch player:", error);
      // Optional: Add a toast notification here
    }
    setLoading(false);
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      fetchPlayer(searchQuery);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="size-8 text-orange-500" />
            <h1 className="text-2xl text-white font-bold tracking-tight">NBA Betting Analysis</h1>
          </div>
          
          {/* Header Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search player (e.g. Steph Curry)..."
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
                <div className="size-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
                <div className="text-orange-500 text-lg animate-pulse font-medium">Scouting Player Data...</div>
            </div>
        ) : !selectedPlayer ? (
            // 3. New "Zero State" UI - Shows when no player is selected
            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                <div className="bg-gray-900 p-6 rounded-full border border-gray-800">
                    <BarChart3 className="size-16 text-gray-700" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-3xl text-white font-bold">Ready to Analyze?</h2>
                    <p className="text-gray-400 text-lg">
                        Search for an NBA player above to view their recent game stats, trends, and AI-powered performance predictions.
                    </p>
                </div>
            </div>
        ) : (
            // Grid only renders when a player is actually found
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Player Stats Column */}
                <div className="lg:col-span-1">
                    <PlayerStatsColumn
                        players={players}
                        selectedPlayer={selectedPlayer}
                        onSelectPlayer={setSelectedPlayer}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />
                </div>

                {/* Stat Prediction Area */}
                <div className="lg:col-span-2">
                    <StatPrediction player={selectedPlayer} />
                </div>
            </div>
        )}
      </div>
    </div>
  );
}