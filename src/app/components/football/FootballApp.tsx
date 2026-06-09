import { useState } from 'react';
import { FootballAllTeamsGrid } from './FootballAllTeamsGrid';
import { FootballPlayerSearch, type PlayerSearchResult } from './FootballPlayerSearch';
import { FootballTeamView } from './FootballTeamView';
import { FootballPlayerView } from './FootballPlayerView';

type FootballMode = 'players' | 'teams';
type TeamsView    = 'grid' | 'team' | 'player';

type TeamEntry = {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  competition: { code: string; name: string };
};

type SquadPlayer = { id: number; name: string; position: string };

export function FootballApp() {
  const [mode, setMode] = useState<FootballMode>('players');

  // Players mode
  const [selectedSearchResult, setSelectedSearchResult] = useState<PlayerSearchResult | null>(null);

  // Teams mode
  const [teamsView, setTeamsView]                 = useState<TeamsView>('grid');
  const [selectedTeam, setSelectedTeam]           = useState<TeamEntry | null>(null);
  const [selectedSquadPlayer, setSelectedSquadPlayer] = useState<SquadPlayer | null>(null);

  const switchMode = (m: FootballMode) => {
    setMode(m);
    if (m === 'teams') {
      setTeamsView('grid');
      setSelectedTeam(null);
      setSelectedSquadPlayer(null);
    } else {
      setSelectedSearchResult(null);
    }
  };

  const handleSelectTeam = (team: TeamEntry) => {
    setSelectedTeam(team);
    setSelectedSquadPlayer(null);
    setTeamsView('team');
  };

  const handleSelectSquadPlayer = (p: SquadPlayer) => {
    setSelectedSquadPlayer(p);
    setTeamsView('player');
  };

  const backToGrid = () => { setTeamsView('grid'); setSelectedTeam(null); setSelectedSquadPlayer(null); };
  const backToTeam = () => { setTeamsView('team'); setSelectedSquadPlayer(null); };

  // Build breadcrumbs for teams mode
  const crumbs: { label: string; onClick: () => void }[] = [];
  if (teamsView !== 'grid') {
    crumbs.push({ label: 'All Teams', onClick: backToGrid });
  }
  if (selectedTeam && (teamsView === 'team' || teamsView === 'player')) {
    crumbs.push({ label: selectedTeam.shortName || selectedTeam.name, onClick: backToTeam });
  }
  if (selectedSquadPlayer && teamsView === 'player') {
    crumbs.push({ label: selectedSquadPlayer.name, onClick: () => {} });
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-gray-900 rounded-xl p-1 w-fit border border-gray-800">
        <button
          onClick={() => switchMode('players')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'players' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
        >
          Players
        </button>
        <button
          onClick={() => switchMode('teams')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'teams' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
        >
          Teams
        </button>
      </div>

      {/* ── Players mode ─────────────────────────────────────────────────── */}
      {mode === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left: search */}
          <FootballPlayerSearch
            onSelectPlayer={setSelectedSearchResult}
            selectedPlayerId={selectedSearchResult?.id ?? null}
          />

          {/* Right: player view or empty state */}
          <div className="lg:col-span-2">
            {selectedSearchResult ? (
              <FootballPlayerView
                playerId={selectedSearchResult.id}
                teamId={selectedSearchResult.teamId}
                teamName={selectedSearchResult.teamName}
                competitionCode={selectedSearchResult.competitionCode}
                initialName={selectedSearchResult.name}
                initialPosition={selectedSearchResult.position}
                backLabel="Back to search results"
                onBack={() => setSelectedSearchResult(null)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-center h-[60vh] rounded-xl border border-gray-800 bg-gray-900/40">
                <div className="text-6xl select-none">⚽</div>
                <p className="text-gray-300 text-lg font-medium">Find a player</p>
                <p className="text-gray-500 text-sm max-w-xs">
                  Search the top scorers from Premier League, La Liga, Bundesliga, Serie A and Ligue 1
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Teams mode ───────────────────────────────────────────────────── */}
      {mode === 'teams' && (
        <div>
          {/* Breadcrumbs */}
          {crumbs.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mb-6">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-700">/</span>}
                  {i < crumbs.length - 1 ? (
                    <button onClick={c.onClick} className="hover:text-green-400 transition-colors">{c.label}</button>
                  ) : (
                    <span className="text-gray-300">{c.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {teamsView === 'grid' && (
            <FootballAllTeamsGrid onSelectTeam={handleSelectTeam} />
          )}

          {teamsView === 'team' && selectedTeam && (
            <FootballTeamView
              team={selectedTeam}
              onSelectPlayer={(p) => handleSelectSquadPlayer(p)}
              onBack={backToGrid}
            />
          )}

          {teamsView === 'player' && selectedSquadPlayer && selectedTeam && (
            <FootballPlayerView
              playerId={selectedSquadPlayer.id}
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              competitionCode={selectedTeam.competition.code}
              initialName={selectedSquadPlayer.name}
              initialPosition={selectedSquadPlayer.position}
              backLabel={`Back to ${selectedTeam.shortName || selectedTeam.name} squad`}
              onBack={backToTeam}
            />
          )}
        </div>
      )}
    </div>
  );
}
