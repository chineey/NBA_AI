import { PlayerPhoto } from './PlayerPhoto';
import { StatBox } from './DesignPrimitives';

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
    pts: number;
    ast: number;
    reb: number;
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

export function PlayerStatsColumn({
  selectedPlayer,
}: PlayerStatsColumnProps) {
  const season = selectedPlayer.seasonAvg ?? { pts: 0, reb: 0, ast: 0 };
  const games = selectedPlayer.recentGames ?? [];
  const recentAvg = games.length
    ? {
        pts: games.reduce((s, g) => s + g.pts, 0) / games.length,
        reb: games.reduce((s, g) => s + g.reb, 0) / games.length,
        ast: games.reduce((s, g) => s + g.ast, 0) / games.length,
      }
    : { pts: 0, reb: 0, ast: 0 };

  const deltaHint = (recent: number, avg: number) => {
    const diff = recent - avg;
    if (Math.abs(diff) < 0.05) return undefined;
    return `${diff > 0 ? '+' : ''}${diff.toFixed(1)} L${games.length} vs season`;
  };

  return (
    <div className="space-y-4">
      <div className="panel flex items-center gap-4 p-6">
        <PlayerPhoto playerId={selectedPlayer.id} name={selectedPlayer.name} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{selectedPlayer.name}</h2>
          <p className="text-sm text-muted-foreground">
            {selectedPlayer.team}
            {selectedPlayer.position && selectedPlayer.position !== '—' ? ` · ${selectedPlayer.position}` : ''}
            {selectedPlayer.jersey ? ` · #${selectedPlayer.jersey}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 stagger">
        <StatBox label="PPG (Season)" value={season.pts.toFixed(1)} hint={deltaHint(recentAvg.pts, season.pts)} />
        <StatBox label="RPG (Season)" value={season.reb.toFixed(1)} hint={deltaHint(recentAvg.reb, season.reb)} />
        <StatBox label="APG (Season)" value={season.ast.toFixed(1)} hint={deltaHint(recentAvg.ast, season.ast)} />
      </div>
    </div>
  );
}
