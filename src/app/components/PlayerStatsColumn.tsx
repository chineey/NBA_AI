import { ChevronRight, Flame, CalendarRange } from 'lucide-react';
import { PlayerPhoto } from './PlayerPhoto';

type Player = {
  id: number;
  name: string;
  team: string;
  position: string;
  height?: string;
  weight?: string;
  jersey?: string;
  age?: number | null;
  experience?: string;
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
  seasonAvg?: { pts: number; reb: number; ast: number };
};

type PlayerStatsColumnProps = {
  players: Player[];
  selectedPlayer: Player;
  onSelectPlayer: (player: Player) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-950/80 border border-white/[0.05] rounded-lg px-2.5 py-1.5">
      <div className="text-[10px] text-gray-500 font-semibold tracking-widest">{label}</div>
      <div className="text-white font-bold tabular-nums">{value.toFixed(1)}</div>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onClick,
  stats,
}: {
  player: Player;
  selected: boolean;
  onClick: () => void;
  stats: { pts: number; reb: number; ast: number };
}) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full p-4 text-left transition-all duration-200 hover:bg-white/[0.03] ${
        selected ? 'bg-orange-500/[0.06]' : ''
      }`}
    >
      {selected && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-gradient-to-b from-orange-400 to-amber-500" />}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <PlayerPhoto playerId={player.id} name={player.name} size="sm" />
          <div>
            <div className="text-white font-semibold">{player.name}</div>
            <div className="text-sm text-gray-400">
              {player.team}{player.jersey ? ` • #${player.jersey}` : ''}{player.position && player.position !== '—' ? ` • ${player.position}` : ''}
            </div>
          </div>
        </div>
        <ChevronRight className={`size-5 transition-all ${selected ? 'text-orange-400 translate-x-0.5' : 'text-gray-600'}`} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <StatChip label="PTS" value={stats.pts} />
        <StatChip label="REB" value={stats.reb} />
        <StatChip label="AST" value={stats.ast} />
      </div>
    </button>
  );
}

function ColumnHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center gap-2.5 bg-white/[0.02]">
      <div className="flex items-center justify-center size-7 rounded-lg bg-orange-500/15 border border-orange-500/20">
        {icon}
      </div>
      <span className="text-gray-300 text-xs font-bold tracking-widest">{title}</span>
    </div>
  );
}

export function PlayerStatsColumn({
  players,
  selectedPlayer,
  onSelectPlayer
}: PlayerStatsColumnProps) {

  const recentAverages = (games: Player['recentGames']) => {
    if (!games || games.length === 0) return { pts: 0, reb: 0, ast: 0 };
    const pts = games.reduce((sum, g) => sum + g.pts, 0) / games.length;
    const reb = games.reduce((sum, g) => sum + g.reb, 0) / games.length;
    const ast = games.reduce((sum, g) => sum + g.ast, 0) / games.length;
    return { pts, reb, ast };
  };

  return (
    <div className="flex flex-col gap-6">

      {/* 1. RECENT GAME STATS */}
      <div className="bg-gray-900/80 rounded-2xl border border-white/[0.07] overflow-hidden">
        <ColumnHeader icon={<Flame className="size-3.5 text-orange-400" />} title="RECENT FORM (LAST 10)" />
        <div className="divide-y divide-white/[0.04] max-h-[calc(100vh-16rem)] overflow-y-auto">
          {players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No players found</div>
          ) : (
            players.map((player) => (
              <PlayerRow
                key={`recent-${player.id}`}
                player={player}
                selected={selectedPlayer?.id === player.id}
                onClick={() => onSelectPlayer(player)}
                stats={recentAverages(player.recentGames)}
              />
            ))
          )}
        </div>
      </div>

      {/* 2. SEASON STATS */}
      <div className="bg-gray-900/80 rounded-2xl border border-white/[0.07] overflow-hidden">
        <ColumnHeader icon={<CalendarRange className="size-3.5 text-orange-400" />} title="SEASON AVERAGES (ALL GAMES)" />
        <div className="divide-y divide-white/[0.04] max-h-[calc(100vh-16rem)] overflow-y-auto">
          {players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No players found</div>
          ) : (
            players.map((player) => (
              <PlayerRow
                key={`season-${player.id}`}
                player={player}
                selected={selectedPlayer?.id === player.id}
                onClick={() => onSelectPlayer(player)}
                stats={player.seasonAvg ?? { pts: 0, reb: 0, ast: 0 }}
              />
            ))
          )}
        </div>
      </div>

    </div>
  );
}
