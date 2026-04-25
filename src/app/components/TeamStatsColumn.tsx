import { Shield, ChevronRight } from 'lucide-react';

type TeamGame = {
  gameDate: string;
  matchup: string;
  wl: string;
  pts: number;
  ast: number;
  reb: number;
  fg3m: number;
};

type Team = {
  abbr: string;
  name: string;
  recentGames: TeamGame[];
  seasonAvg: { pts: number; reb: number; ast: number; fg3m: number };
  totalGames: number;
};

type TeamStatsColumnProps = {
  teams: Team[];
  selectedTeam: Team | null;
  onSelectTeam: (team: Team) => void;
};

export function TeamStatsColumn({ teams, selectedTeam, onSelectTeam }: TeamStatsColumnProps) {
  const recentAvg = (games: TeamGame[]) => {
    if (!games || games.length === 0) return { pts: 0, reb: 0, ast: 0 };
    const n = games.length;
    return {
      pts: games.reduce((s, g) => s + g.pts, 0) / n,
      reb: games.reduce((s, g) => s + g.reb, 0) / n,
      ast: games.reduce((s, g) => s + g.ast, 0) / n,
    };
  };

  const TeamCard = ({ team, avgData }: { team: Team; avgData: { pts: number; reb: number; ast: number } }) => (
    <button
      onClick={() => onSelectTeam(team)}
      className={`w-full p-4 text-left transition-colors hover:bg-gray-800 ${
        selectedTeam?.abbr === team.abbr ? 'bg-gray-800' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
            <span className="text-orange-400 text-xs font-bold">{team.abbr}</span>
          </div>
          <div>
            <div className="text-white font-medium">{team.name}</div>
            <div className="text-sm text-gray-400">NBA • {team.totalGames} games</div>
          </div>
        </div>
        <ChevronRight className="size-5 text-gray-600" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-gray-950 rounded px-2 py-1">
          <div className="text-xs text-gray-500">PTS</div>
          <div className="text-white">{avgData.pts.toFixed(1)}</div>
        </div>
        <div className="bg-gray-950 rounded px-2 py-1">
          <div className="text-xs text-gray-500">REB</div>
          <div className="text-white">{avgData.reb.toFixed(1)}</div>
        </div>
        <div className="bg-gray-950 rounded px-2 py-1">
          <div className="text-xs text-gray-500">AST</div>
          <div className="text-white">{avgData.ast.toFixed(1)}</div>
        </div>
      </div>
    </button>
  );

  const empty = (
    <div className="p-8 text-center text-gray-500">No team found</div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* RECENT GAME STATS */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <Shield className="size-4 text-orange-500" />
          <span className="text-gray-400 text-sm font-bold tracking-wider">RECENT GAME STATS (LAST 10)</span>
        </div>
        <div className="divide-y divide-gray-800 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {teams.length === 0 ? empty : teams.map((team) => (
            <TeamCard key={`recent-${team.abbr}`} team={team} avgData={recentAvg(team.recentGames)} />
          ))}
        </div>
      </div>

      {/* SEASON STATS */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <Shield className="size-4 text-orange-500" />
          <span className="text-gray-400 text-sm font-bold tracking-wider">SEASON STATS (ALL GAMES)</span>
        </div>
        <div className="divide-y divide-gray-800 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {teams.length === 0 ? empty : teams.map((team) => (
            <TeamCard key={`season-${team.abbr}`} team={team} avgData={team.seasonAvg} />
          ))}
        </div>
      </div>
    </div>
  );
}
