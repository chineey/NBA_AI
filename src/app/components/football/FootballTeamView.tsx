import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Trophy, TrendingUp, Sparkles, Users } from 'lucide-react';

type SquadPlayer = {
  id: number;
  name: string;
  position: string;
  nationality: string;
  dateOfBirth: string;
  age: number | null;
};

type SquadData = {
  id: number;
  name: string;
  shortName: string;
  crest: string;
  squad: SquadPlayer[];
};

type TeamMatch = {
  matchId: number;
  date: string;
  competition: string;
  opponent: string;
  opponentCrest: string;
  homeAway: string;
  goalsFor: number;
  goalsAgainst: number;
  result: string;
  score: string;
};

type TeamStats = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  venue: string;
  founded: number | null;
  recentMatches: TeamMatch[];
  seasonStats: {
    totalMatches: number;
    wins: number;
    draws: number;
    losses: number;
    cleanSheets: number;
    goalsFor: number;
    goalsAgainst: number;
    avgGoalsFor: number;
    avgGoalsAgainst: number;
    points: number | null;
    position: number | null;
  };
  nextMatch: { date: string; opponent: string; homeAway: string; competition: string } | null;
};

type TeamPrediction = {
  goals_for_predicted: number;  goals_for_low: number;  goals_for_high: number;
  goals_against_predicted: number; goals_against_low: number; goals_against_high: number;
  clean_sheet_probability: number;
  win_probability: number; draw_probability: number; loss_probability: number;
};

const EMPTY_PRED: TeamPrediction = {
  goals_for_predicted: 0, goals_for_low: 0, goals_for_high: 0,
  goals_against_predicted: 0, goals_against_low: 0, goals_against_high: 0,
  clean_sheet_probability: 0,
  win_probability: 0, draw_probability: 0, loss_probability: 0,
};

const POS_COLOR: Record<string, string> = {
  Goalkeeper: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Defence:    'bg-blue-500/20  text-blue-400  border-blue-500/30',
  Midfield:   'bg-green-500/20 text-green-400 border-green-500/30',
  Offence:    'bg-red-500/20   text-red-400   border-red-500/30',
};

const POS_ABBR: Record<string, string> = {
  Goalkeeper: 'GK',
  Defence:    'DEF',
  Midfield:   'MID',
  Offence:    'FWD',
};

function PlayerAvatar({ player, size = 'sm' }: { player: SquadPlayer; size?: 'sm' | 'md' }) {
  const cls = POS_COLOR[player.position] || 'bg-gray-700 text-gray-300 border-gray-600';
  const dim = size === 'md' ? 'size-12 text-sm' : 'size-9 text-xs';
  const initials = player.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  return (
    <div className={`${dim} ${cls} rounded-full flex items-center justify-center border font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

function StatCard({
  label, value, sub,
}: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl text-white font-semibold">{value}</div>
      {sub && <div className="text-xs text-green-400 mt-0.5">{sub}</div>}
    </div>
  );
}

type Props = {
  team: { id: number; name: string; shortName: string; tla: string; crest: string; competition: { code: string; name: string } };
  onSelectPlayer: (player: SquadPlayer, teamName: string) => void;
  onBack: () => void;
};

export function FootballTeamView({ team, onSelectPlayer, onBack }: Props) {
  const competitionCode = team.competition.code;
  const [squadData, setSquadData] = useState<SquadData | null>(null);
  const [teamStats, setTeamStats] = useState<TeamStats | null>(null);
  const [loadingSquad, setLoadingSquad] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [predLoading, setPredLoading] = useState(false);
  const [prediction, setPrediction] = useState<TeamPrediction>(EMPTY_PRED);
  const [predReason, setPredReason] = useState(
    'Click "Generate AI Prediction" to analyse recent form and predict the next match.'
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [posFilter, setPosFilter] = useState<string>('All');

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL;

  useEffect(() => {
    setSquadData(null);
    setTeamStats(null);
    setLoadingSquad(true);
    setLoadingStats(true);
    setPrediction(EMPTY_PRED);
    setHasGenerated(false);

    fetch(`${BASE}/football/teams/${team.id}/squad`)
      .then(r => r.json())
      .then(setSquadData)
      .catch(console.error)
      .finally(() => setLoadingSquad(false));

    fetch(`${BASE}/football/teams/${team.id}?competition_code=${competitionCode}`)
      .then(r => r.json())
      .then(setTeamStats)
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  }, [team.id]);

  const generatePrediction = async () => {
    if (!teamStats) return;
    setPredLoading(true);
    try {
      const r = await fetch(`${BASE}/football/predict/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id, team_name: teamStats.name, competition_code: competitionCode }),
      });
      if (!r.ok) throw new Error('Prediction failed');
      const data = await r.json();
      const p = typeof data === 'string' ? JSON.parse(data) : data;
      setPrediction({
        goals_for_predicted: p.goals_for_predicted ?? 0,
        goals_for_low:       p.goals_for_low       ?? 0,
        goals_for_high:      p.goals_for_high      ?? 0,
        goals_against_predicted: p.goals_against_predicted ?? 0,
        goals_against_low:       p.goals_against_low       ?? 0,
        goals_against_high:      p.goals_against_high      ?? 0,
        clean_sheet_probability: p.clean_sheet_probability ?? 0,
        win_probability:  p.win_probability  ?? 0,
        draw_probability: p.draw_probability ?? 0,
        loss_probability: p.loss_probability ?? 0,
      });
      setPredReason(p.prediction_reasoning ?? 'No reasoning provided.');
      setHasGenerated(true);
    } catch (e) {
      console.error(e);
      setPredReason('Failed to generate prediction. Please try again.');
    } finally {
      setPredLoading(false);
    }
  };

  const positions = ['All', 'Goalkeeper', 'Defence', 'Midfield', 'Offence'];
  const filteredSquad = squadData?.squad.filter(
    p => posFilter === 'All' || p.position === posFilter
  ) ?? [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400">
      {/* Header */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="size-5" />
          </button>
          {team.crest ? (
            <img src={team.crest} alt={team.name} className="size-14 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
          ) : (
            <div className="size-14 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
              <span className="text-green-400 text-sm font-bold">{team.tla}</span>
            </div>
          )}
          <div>
            <h2 className="text-2xl text-white font-bold">{team.name}</h2>
            {teamStats && (
              <p className="text-gray-400 text-sm mt-0.5">
                {teamStats.venue && `${teamStats.venue} · `}
                {teamStats.seasonStats.totalMatches} matches analysed
              </p>
            )}
          </div>
          {teamStats?.nextMatch && (
            <div className="ml-auto px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-right">
              <div className="text-xs text-green-400 mb-0.5">Next Match</div>
              <div className="text-white font-medium text-sm">vs {teamStats.nextMatch.opponent}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {teamStats.nextMatch.date} · {teamStats.nextMatch.homeAway}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Squad panel */}
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800">
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
              <Users className="size-4 text-green-500" />
              <span className="text-gray-400 text-sm font-bold tracking-wider">SQUAD</span>
            </div>

            {/* Position filter tabs */}
            <div className="flex gap-1 p-2 border-b border-gray-800 flex-wrap">
              {positions.map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    posFilter === pos
                      ? 'bg-green-500 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {pos === 'Offence' ? 'FWD' : pos === 'Goalkeeper' ? 'GK' : pos === 'Defence' ? 'DEF' : pos === 'Midfield' ? 'MID' : pos}
                </button>
              ))}
            </div>

            <div className="divide-y divide-gray-800 max-h-[calc(100vh-22rem)] overflow-y-auto">
              {loadingSquad ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="size-6 text-green-500 animate-spin" />
                </div>
              ) : filteredSquad.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">No players found</div>
              ) : (
                filteredSquad.map(player => (
                  <button
                    key={player.id}
                    onClick={() => onSelectPlayer(player, team.name)}
                    className="w-full p-3 flex items-center gap-3 hover:bg-gray-800 transition-colors text-left"
                  >
                    <PlayerAvatar player={player} />
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm font-medium truncate">{player.name}</div>
                      <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs border ${POS_COLOR[player.position] || 'bg-gray-700 text-gray-400 border-gray-600'}`}>
                          {POS_ABBR[player.position] ?? player.position}
                        </span>
                        {player.nationality && <span>{player.nationality}</span>}
                        {player.age !== null && <span>{player.age} yrs</span>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Stats + Prediction panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Season stats */}
          {loadingStats ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="size-6 text-green-500 animate-spin" />
            </div>
          ) : teamStats ? (
            <>
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm text-gray-400 font-bold tracking-wider">SEASON STATS</h3>
                  {teamStats.seasonStats.position && (
                    <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
                      #{teamStats.seasonStats.position} in table
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <StatCard label="W" value={teamStats.seasonStats.wins} />
                  <StatCard label="D" value={teamStats.seasonStats.draws} />
                  <StatCard label="L" value={teamStats.seasonStats.losses} />
                  {teamStats.seasonStats.points != null && (
                    <StatCard label="PTS" value={teamStats.seasonStats.points} />
                  )}
                  <StatCard label="GF" value={teamStats.seasonStats.goalsFor} sub={`${teamStats.seasonStats.avgGoalsFor}/g`} />
                  <StatCard label="GA" value={teamStats.seasonStats.goalsAgainst} sub={`${teamStats.seasonStats.avgGoalsAgainst}/g`} />
                  <StatCard label="CS" value={teamStats.seasonStats.cleanSheets} sub="clean sheets" />
                  <StatCard label="GP" value={teamStats.seasonStats.totalMatches} sub="played" />
                </div>
              </div>

              {/* Recent matches table */}
              <div className="bg-gray-900 rounded-xl border border-gray-800">
                <div className="p-4 border-b border-gray-800">
                  <h3 className="text-lg text-white">Recent Matches</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-950">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs text-gray-400 sticky left-0 bg-gray-950">DATE</th>
                        <th className="px-3 py-3 text-left text-xs text-gray-400">OPPONENT</th>
                        <th className="px-3 py-3 text-center text-xs text-gray-400">H/A</th>
                        <th className="px-3 py-3 text-center text-xs text-gray-400">SCORE</th>
                        <th className="px-3 py-3 text-center text-xs text-gray-400">RES</th>
                        <th className="px-3 py-3 text-left text-xs text-gray-400">COMPETITION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {teamStats.recentMatches.map((m, i) => (
                        <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                          <td className="px-3 py-3 text-white sticky left-0 bg-gray-900 hover:bg-gray-800/50">{m.date}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {m.opponentCrest && (
                                <img src={m.opponentCrest} alt="" className="size-5 object-contain"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              )}
                              <span className="text-gray-300 whitespace-nowrap">{m.opponent}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${m.homeAway === 'HOME' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                              {m.homeAway === 'HOME' ? 'H' : 'A'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center text-white font-medium">{m.score}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              m.result === 'W' ? 'bg-green-500/20 text-green-400' :
                              m.result === 'D' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {m.result}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{m.competition}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Prediction */}
              <div className="bg-gray-900 rounded-xl border border-gray-800">
                <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="size-5 text-green-500" />
                    <div>
                      <h3 className="text-lg text-white">Predicted Stats for Next Match</h3>
                      {hasGenerated && (
                        <p className="text-xs text-gray-500 mt-0.5">Range shows low – high confidence interval</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={generatePrediction}
                    disabled={predLoading}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {predLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
                  </button>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                      <div className="text-xs text-gray-500 mb-1">GOALS SCORED</div>
                      <div className="text-2xl text-white font-semibold">{prediction.goals_for_predicted}</div>
                      {hasGenerated && (
                        <div className="text-xs text-gray-500 mt-1">
                          Range: <span className="text-green-400">{prediction.goals_for_low} – {prediction.goals_for_high}</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                      <div className="text-xs text-gray-500 mb-1">GOALS CONCEDED</div>
                      <div className="text-2xl text-white font-semibold">{prediction.goals_against_predicted}</div>
                      {hasGenerated && (
                        <div className="text-xs text-gray-500 mt-1">
                          Range: <span className="text-green-400">{prediction.goals_against_low} – {prediction.goals_against_high}</span>
                        </div>
                      )}
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                      <div className="text-xs text-gray-500 mb-1">CLEAN SHEET %</div>
                      <div className="text-2xl text-white font-semibold">
                        {hasGenerated ? `${Math.round(prediction.clean_sheet_probability * 100)}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                      <div className="text-xs text-gray-500 mb-2">RESULT ODDS</div>
                      {hasGenerated ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-green-400">Win</span>
                            <span className="text-white">{Math.round(prediction.win_probability * 100)}%</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-yellow-400">Draw</span>
                            <span className="text-white">{Math.round(prediction.draw_probability * 100)}%</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-red-400">Loss</span>
                            <span className="text-white">{Math.round(prediction.loss_probability * 100)}%</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600 text-sm">—</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-gray-900 rounded-xl border border-gray-800">
                <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                  <TrendingUp className="size-5 text-green-500" />
                  <h3 className="text-lg text-white">Reason for Prediction</h3>
                </div>
                <div className="p-5">
                  <textarea
                    value={predReason}
                    readOnly
                    rows={4}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg p-4 text-white focus:outline-none resize-none"
                  />
                  <div className="mt-3 text-sm text-gray-400">
                    Tip: Consider recent form, home advantage, head-to-head record, and key player availability.
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
