import { useState, useEffect } from 'react';
import { Calendar, Trophy, TrendingUp, Sparkles, Handshake } from 'lucide-react';
import { MatchPrediction } from './MatchPrediction';

const FOOTBALL_API = import.meta.env.VITE_FOOTBALL_API_URL ?? 'http://127.0.0.1:8001';

interface WCMatch {
  matchId: number;
  utcDate: string;
  date: string;
  status: string;
  stage: string;
  group: string | null;
  matchday: number | null;
  homeTeam: { id: number; name: string; shortName: string; crest: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string; tla: string };
  score: {
    winner: string | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  venue: string;
}

interface StandingEntry {
  position: number;
  team: { id: number; name: string; shortName: string; crest: string; tla: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

interface Group {
  stage: string;
  group: string | null;
  table: StandingEntry[];
}

interface Scorer {
  rank: number;
  player: { id: number; name: string; nationality: string; position: string };
  team: { id: number; name: string; shortName: string; crest: string; tla: string };
  goals: number;
  assists: number;
  penalties: number | null;
  playedMatches: number;
}

interface Assister {
  rank: number;
  player: { id: number; name: string; nationality: string; position: string };
  team: { id: number; name: string; shortName: string; crest: string; tla: string };
  assists: number;
  goals: number;
  playedMatches: number;
}

type FixtureFilter = 'ALL' | 'LIVE' | 'SCHEDULED' | 'FINISHED';

export function FootballApp() {
  const [matches, setMatches]   = useState<WCMatch[]>([]);
  const [groups, setGroups]     = useState<Group[]>([]);
  const [scorers, setScorers]   = useState<Scorer[]>([]);
  const [assisters, setAssisters] = useState<Assister[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [fixtureFilter, setFixtureFilter] = useState<FixtureFilter>('ALL');
  const [predictMatchId, setPredictMatchId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${FOOTBALL_API}/football/worldcup/fixtures`).then(r => { if (!r.ok) throw new Error(`Fixtures: ${r.status}`); return r.json(); }),
      fetch(`${FOOTBALL_API}/football/worldcup/standings`).then(r => { if (!r.ok) throw new Error(`Standings: ${r.status}`); return r.json(); }),
      fetch(`${FOOTBALL_API}/football/worldcup/scorers?limit=20`).then(r => { if (!r.ok) throw new Error(`Scorers: ${r.status}`); return r.json(); }),
      fetch(`${FOOTBALL_API}/football/worldcup/assists?limit=20`).then(r => r.ok ? r.json() : { assists: [] }),
    ])
      .then(([fixturesData, standingsData, scorersData, assistsData]) => {
        setMatches(fixturesData.matches ?? []);
        setGroups(standingsData.groups ?? []);
        setScorers(scorersData.scorers ?? []);
        setAssisters(assistsData.assists ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredMatches = matches.filter(m => {
    if (fixtureFilter === 'ALL')       return true;
    if (fixtureFilter === 'LIVE')      return ['IN_PLAY', 'PAUSED', 'LIVE'].includes(m.status);
    if (fixtureFilter === 'SCHEDULED') return ['SCHEDULED', 'TIMED'].includes(m.status);
    if (fixtureFilter === 'FINISHED')  return m.status === 'FINISHED';
    return true;
  });

  const liveCount = matches.filter(m => ['IN_PLAY', 'PAUSED', 'LIVE'].includes(m.status)).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="size-10 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
        <div className="text-green-400 text-lg animate-pulse font-medium">Loading World Cup data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-center">
        <div className="text-5xl">⚽</div>
        <p className="text-red-400 font-medium">Failed to load data</p>
        <p className="text-gray-500 text-sm max-w-xs">{error}</p>
      </div>
    );
  }

  const formatMatchTime = (utcDate: string) =>
    new Date(utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const formatMatchDate = (utcDate: string) =>
    new Date(utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const statusBadge = (status: string) => {
    if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(status))
      return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 font-medium animate-pulse">LIVE</span>;
    if (status === 'FINISHED')
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400 font-medium">FT</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 font-medium">TBD</span>;
  };

  const formatGroup = (g: string | null, stage: string) =>
    g ? g.replace('GROUP_', 'Group ') : stage.replace(/_/g, ' ');

  return (
    <div className="space-y-10">

      {/* ── Fixtures ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-green-400" />
            <h2 className="text-white text-xl font-semibold">Fixtures</h2>
            <span className="text-gray-500 text-sm">({matches.length})</span>
            <span className="hidden sm:inline text-gray-600 text-xs">· tap a fixture for the AI prediction</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
            {(['ALL', 'LIVE', 'SCHEDULED', 'FINISHED'] as FixtureFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFixtureFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors relative ${
                  fixtureFilter === f ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {f === 'LIVE' && liveCount > 0 && (
                  <span className="absolute -top-1 -right-1 size-2 bg-green-400 rounded-full" />
                )}
                {f}
              </button>
            ))}
          </div>
        </div>

        {filteredMatches.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">No matches for this filter.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredMatches.map(m => (
              <button
                key={m.matchId}
                onClick={() => setPredictMatchId(m.matchId)}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 text-left w-full
                           hover:border-green-500/50 hover:bg-gray-900/80 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatGroup(m.group, m.stage)}</span>
                  <div className="flex items-center gap-2">
                    <span className="hidden group-hover:flex items-center gap-1 text-green-400 font-medium">
                      <Sparkles className="size-3" /> Predict
                    </span>
                    {statusBadge(m.status)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <img
                      src={m.homeTeam.crest} alt=""
                      className="size-8 object-contain"
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                    <span className="text-white text-xs font-medium text-center truncate w-full">{m.homeTeam.shortName}</span>
                  </div>

                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    {m.status === 'FINISHED' || ['IN_PLAY', 'PAUSED'].includes(m.status) ? (
                      <span className="text-white text-lg font-bold tabular-nums">
                        {m.score.fullTime.home ?? 0} – {m.score.fullTime.away ?? 0}
                      </span>
                    ) : (
                      <>
                        <span className="text-white text-sm font-semibold">{formatMatchTime(m.utcDate)}</span>
                        <span className="text-gray-500 text-xs">{formatMatchDate(m.utcDate)}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                    <img
                      src={m.awayTeam.crest} alt=""
                      className="size-8 object-contain"
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                    <span className="text-white text-xs font-medium text-center truncate w-full">{m.awayTeam.shortName}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Group Standings ──────────────────────────────────────────────── */}
      {groups.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="size-5 text-green-400" />
            <h2 className="text-white text-xl font-semibold">Group Standings</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {groups.map((grp, idx) => (
              <div key={idx} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="bg-gray-800/60 px-4 py-2 border-b border-gray-800">
                  <span className="text-green-400 text-sm font-semibold">{formatGroup(grp.group, grp.stage)}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left px-3 py-2 font-medium w-5">#</th>
                      <th className="text-left px-2 py-2 font-medium">Team</th>
                      <th className="text-center px-1 py-2 font-medium">P</th>
                      <th className="text-center px-1 py-2 font-medium">W</th>
                      <th className="text-center px-1 py-2 font-medium">D</th>
                      <th className="text-center px-1 py-2 font-medium">L</th>
                      <th className="text-center px-1 py-2 font-medium">GD</th>
                      <th className="text-center px-1 py-2 font-medium">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grp.table.map(entry => (
                      <tr key={entry.team.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                        <td className="px-3 py-2 text-gray-500">{entry.position}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <img
                              src={entry.team.crest} alt=""
                              className="size-4 object-contain"
                              onError={e => (e.currentTarget.style.display = 'none')}
                            />
                            <span className="text-white font-medium">{entry.team.tla || entry.team.shortName}</span>
                          </div>
                        </td>
                        <td className="text-center px-1 py-2 text-gray-400">{entry.playedGames}</td>
                        <td className="text-center px-1 py-2 text-gray-400">{entry.won}</td>
                        <td className="text-center px-1 py-2 text-gray-400">{entry.draw}</td>
                        <td className="text-center px-1 py-2 text-gray-400">{entry.lost}</td>
                        <td className="text-center px-1 py-2 text-gray-400">
                          {entry.goalDifference > 0 ? `+${entry.goalDifference}` : entry.goalDifference}
                        </td>
                        <td className="text-center px-1 py-2 text-white font-semibold">{entry.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top Scorers ──────────────────────────────────────────────────── */}
      {scorers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="size-5 text-green-400" />
            <h2 className="text-white text-xl font-semibold">Top Scorers</h2>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800 text-xs">
                  <th className="text-center px-4 py-3 font-medium w-10">#</th>
                  <th className="text-left px-4 py-3 font-medium">Player</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Team</th>
                  <th className="text-center px-4 py-3 font-medium hidden md:table-cell">Pos</th>
                  <th className="text-center px-4 py-3 font-medium">MP</th>
                  <th className="text-center px-4 py-3 font-medium">Goals</th>
                  <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Assists</th>
                  <th className="text-center px-4 py-3 font-medium hidden md:table-cell">Pen</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map(s => (
                  <tr key={s.player.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                    <td className="text-center px-4 py-3">
                      <span className={`font-bold ${s.rank <= 3 ? 'text-green-400' : 'text-gray-500'}`}>{s.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{s.player.name}</div>
                      <div className="text-gray-500 text-xs">{s.player.nationality}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <img
                          src={s.team.crest} alt=""
                          className="size-5 object-contain"
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                        <span className="text-gray-300 text-xs">{s.team.shortName}</span>
                      </div>
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {s.player.position || '—'}
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400">{s.playedMatches}</td>
                    <td className="text-center px-4 py-3">
                      <span className="text-white font-bold text-base">{s.goals}</span>
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400 hidden sm:table-cell">{s.assists ?? 0}</td>
                    <td className="text-center px-4 py-3 text-gray-400 hidden md:table-cell">{s.penalties ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Top Assists ──────────────────────────────────────────────────── */}
      {assisters.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="size-5 text-green-400" />
            <h2 className="text-white text-xl font-semibold">Top Assists</h2>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800 text-xs">
                  <th className="text-center px-4 py-3 font-medium w-10">#</th>
                  <th className="text-left px-4 py-3 font-medium">Player</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Team</th>
                  <th className="text-center px-4 py-3 font-medium hidden md:table-cell">Pos</th>
                  <th className="text-center px-4 py-3 font-medium">MP</th>
                  <th className="text-center px-4 py-3 font-medium">Assists</th>
                  <th className="text-center px-4 py-3 font-medium hidden sm:table-cell">Goals</th>
                </tr>
              </thead>
              <tbody>
                {assisters.map(s => (
                  <tr key={s.player.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                    <td className="text-center px-4 py-3">
                      <span className={`font-bold ${s.rank <= 3 ? 'text-green-400' : 'text-gray-500'}`}>{s.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{s.player.name}</div>
                      <div className="text-gray-500 text-xs">{s.player.nationality}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <img
                          src={s.team.crest} alt=""
                          className="size-5 object-contain"
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                        <span className="text-gray-300 text-xs">{s.team.shortName}</span>
                      </div>
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                      {s.player.position || '—'}
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400">{s.playedMatches}</td>
                    <td className="text-center px-4 py-3">
                      <span className="text-white font-bold text-base">{s.assists}</span>
                    </td>
                    <td className="text-center px-4 py-3 text-gray-400 hidden sm:table-cell">{s.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Prediction modal ─────────────────────────────────────────────── */}
      {predictMatchId !== null && (
        <MatchPrediction matchId={predictMatchId} onClose={() => setPredictMatchId(null)} />
      )}

    </div>
  );
}
