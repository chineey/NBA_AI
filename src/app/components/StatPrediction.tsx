import { Calendar, Trophy, TrendingUp, Sparkles, Loader2 } from 'lucide-react';
import { useState } from 'react';

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
};

type StatPredictionProps = {
  player: Player;
};

export function StatPrediction({ player }: StatPredictionProps) {
  const [loading, setLoading] = useState(false);
  
  // Prediction state - initialized with 0s
  const [prediction, setPrediction] = useState({
    pts: 0,
    ast: 0,
    reb: 0,
    fg3m: 0,
  });

  const [predictionReason, setPredictionReason] = useState(
    'Click "Generate AI Prediction" to analyze recent games and predict the next performance.'
  );

  const generatePrediction = async () => {
    setLoading(true);
    try {
      const payload = {
        player_name: player.name,
        stats: player.recentGames 
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to generate prediction');
      }

      const data = await response.json();
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

      setPrediction({
        pts: parsedData.pts || 0,
        ast: parsedData.ast || 0,
        reb: parsedData.reb || 0,
        fg3m: parsedData.fg3m || 0,
      });
      setPredictionReason(parsedData.prediction_reasoning || "No reasoning provided.");

    } catch (error) {
      console.error("Prediction Error:", error);
      setPredictionReason("Failed to generate prediction. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Player Header (RESTORED) */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl text-white mb-1">{player.name}</h2>
            <p className="text-gray-400">
              {player.team} • {player.position}
            </p>
          </div>
          <div className="px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <div className="text-xs text-orange-400">Next Game</div>
            <div className="text-white">1/23 vs MIA</div>
          </div>
        </div>
      </div>

      {/* 2. Recent Games Table (RESTORED) */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-lg text-white">Recent Games</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-950">
              <tr>
                <th className="px-3 py-3 text-left text-xs text-gray-400 sticky left-0 bg-gray-950">GAME_DATE</th>
                <th className="px-3 py-3 text-left text-xs text-gray-400">MATCHUP</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">W/L</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">MIN</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">PTS</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">AST</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">REB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">STL</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">BLK</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">OREB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">DREB</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG_PCT</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3M</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3A</th>
                <th className="px-3 py-3 text-center text-xs text-gray-400">FG3_PCT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {player.recentGames.map((game, index) => (
                <tr key={index} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-3 text-white sticky left-0 bg-gray-900 hover:bg-gray-800/50">
                    {game.gameDate}
                  </td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{game.matchup}</td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        game.wl === 'W'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {game.wl}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.min}</td>
                  <td className="px-3 py-3 text-center text-white">{game.pts}</td>
                  <td className="px-3 py-3 text-center text-white">{game.ast}</td>
                  <td className="px-3 py-3 text-center text-white">{game.reb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.stl}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.blk}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.oreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.dreb}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{(game.fgPct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.fg3m}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{game.fg3a}</td>
                  <td className="px-3 py-3 text-center text-gray-300">{(game.fg3Pct * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Predicted Stats (MODIFIED: Added Button & Filtered to 4 items) */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-orange-500" />
            <h3 className="text-lg text-white">Predicted Stats for Next Game</h3>
          </div>
          <button
            onClick={generatePrediction}
            disabled={loading}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate AI Prediction
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             {/* POINTS */}
            <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">PTS</div>
              <div className="text-xl text-white">{prediction.pts}</div>
            </div>
             {/* ASSISTS */}
            <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">AST</div>
              <div className="text-xl text-white">{prediction.ast}</div>
            </div>
             {/* REBOUNDS */}
            <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">REB</div>
              <div className="text-xl text-white">{prediction.reb}</div>
            </div>
             {/* 3-POINTERS */}
            <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
              <div className="text-xs text-gray-500 mb-1">FG3M</div>
              <div className="text-xl text-white">{prediction.fg3m}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Prediction Reasoning (RESTORED UI) */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800 flex items-center gap-2">
          <TrendingUp className="size-5 text-orange-500" />
          <h3 className="text-lg text-white">Reason for Prediction</h3>
        </div>
        <div className="p-6">
          <textarea
            value={predictionReason}
            readOnly
            rows={4}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
          />
          <div className="mt-4 text-sm text-gray-400">
            Tip: Consider factors like recent form, matchup history, injury reports, and team dynamics
            when making predictions.
          </div>
        </div>
      </div>
    </div>
  );
}