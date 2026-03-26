import { User, ChevronRight, Search } from 'lucide-react';

type Player = {
  id: number;
  name: string;
  team: string;
  position: string;
  recentGames: Array<{
    gameDate: string;
    matchup: string;
    wl: string;
    min: number;
    fgPct: number;
    fg3m: number;
    fg3a: number;
    fg3Pct: number;
    pts: number;
    ast: number;
    reb: number;
    stl: number;
    blk: number;
    oreb: number;
    dreb: number;
  }>;
  // We add allGames here so the frontend knows to expect it
  allGames?: Array<{
    gameDate: string;
    matchup: string;
    wl: string;
    min: number;
    fgPct: number;
    fg3m: number;
    fg3a: number;
    fg3Pct: number;
    pts: number;
    ast: number;
    reb: number;
    stl: number;
    blk: number;
    oreb: number;
    dreb: number;
  }>;
};

type PlayerStatsColumnProps = {
  players: Player[];
  selectedPlayer: Player;
  onSelectPlayer: (player: Player) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function PlayerStatsColumn({ 
  players, 
  selectedPlayer, 
  onSelectPlayer
}: PlayerStatsColumnProps) {
  
  // Notice this now accepts a specific array of games, not the whole player!
  const calculateAverages = (games: any[] | undefined) => {
    if (!games || games.length === 0) return { pts: 0, reb: 0, ast: 0 };
    const pts = games.reduce((sum, g) => sum + g.pts, 0) / games.length;
    const reb = games.reduce((sum, g) => sum + g.reb, 0) / games.length;
    const ast = games.reduce((sum, g) => sum + g.ast, 0) / games.length;
    return { pts, reb, ast };
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. RECENT GAME STATS */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <span className="text-gray-400 text-sm font-bold tracking-wider">RECENT GAME STATS (LAST 10)</span>
        </div>
        <div className="divide-y divide-gray-800 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No players found
            </div>
          ) : (
            players.map((player) => {
              // We pass ONLY the recent 10 games into the math function
              const averages = calculateAverages(player.recentGames);
              return (
                <button
                  key={`recent-${player.id}`}
                  onClick={() => onSelectPlayer(player)}
                  className={`w-full p-4 text-left transition-colors hover:bg-gray-800 ${
                    selectedPlayer?.id === player.id ? 'bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-gray-800 flex items-center justify-center">
                        <User className="size-5 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-white">{player.name}</div>
                        <div className="text-sm text-gray-400">
                          {player.team} • {player.position}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-gray-600" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">PTS</div>
                      <div className="text-white">{averages.pts.toFixed(1)}</div>
                    </div>
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">REB</div>
                      <div className="text-white">{averages.reb.toFixed(1)}</div>
                    </div>
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">AST</div>
                      <div className="text-white">{averages.ast.toFixed(1)}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. SEASON STATS DUPLICATE */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <span className="text-gray-400 text-sm font-bold tracking-wider">SEASON STATS (ALL GAMES)</span>
        </div>
        <div className="divide-y divide-gray-800 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No players found
            </div>
          ) : (
            players.map((player) => {
              // We pass ALL games into the math function here
              const averages = calculateAverages(player.allGames);
              return (
                <button
                  key={`season-${player.id}`} 
                  onClick={() => onSelectPlayer(player)}
                  className={`w-full p-4 text-left transition-colors hover:bg-gray-800 ${
                    selectedPlayer?.id === player.id ? 'bg-gray-800' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-gray-800 flex items-center justify-center">
                        <User className="size-5 text-gray-400" />
                      </div>
                      <div>
                        <div className="text-white">{player.name}</div>
                        <div className="text-sm text-gray-400">
                          {player.team} • {player.position}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-gray-600" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">PTS</div>
                      <div className="text-white">{averages.pts.toFixed(1)}</div>
                    </div>
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">REB</div>
                      <div className="text-white">{averages.reb.toFixed(1)}</div>
                    </div>
                    <div className="bg-gray-950 rounded px-2 py-1">
                      <div className="text-xs text-gray-500">AST</div>
                      <div className="text-white">{averages.ast.toFixed(1)}</div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      
    </div>
  );
}