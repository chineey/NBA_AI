import { useState } from 'react';
import { Grid3x3, Trophy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { CompetitionsGrid } from './CompetitionsGrid';
import { FootballTeamsGrid, type FootballTeam } from './FootballTeamsGrid';
import { FootballAllTeamsGrid, type TeamEntry } from './FootballAllTeamsGrid';
import { FootballTeamView, type SquadPlayer } from './FootballTeamView';
import { FootballPlayerView } from './FootballPlayerView';
import { FootballPlayerSearch, type PlayerSearchResult } from './FootballPlayerSearch';

type View = 'browse' | 'competition-teams' | 'team' | 'player';
type BrowseMode = 'competitions' | 'all-teams';

type SelectedTeam = {
  id: number; name: string; shortName: string; tla: string; crest: string;
  competition: { code: string; name: string };
};

type SelectedPlayer = {
  playerId: number; teamId: number; teamName: string; competitionCode: string;
  initialName: string; initialPosition: string; backLabel?: string;
};

export function FootballApp() {
  const [view, setView] = useState<View>('browse');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('competitions');

  const [competitionCode, setCompetitionCode] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [allTeams, setAllTeams] = useState<TeamEntry[]>([]);

  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);
  const [returnView, setReturnView] = useState<View>('browse');

  const handleSelectCompetition = (code: string, name: string) => {
    setCompetitionCode(code);
    setCompetitionName(name);
    setView('competition-teams');
  };

  const handleSelectTeamFromCompetition = (team: FootballTeam) => {
    setSelectedTeam({ ...team, competition: { code: competitionCode, name: competitionName } });
    setReturnView('competition-teams');
    setView('team');
  };

  const handleSelectTeamFromAll = (team: TeamEntry) => {
    setSelectedTeam(team);
    setReturnView('browse'); // browseMode state (still 'all-teams') is untouched, so browse restores correctly
    setView('team');
  };

  const handleSelectPlayerFromTeam = (player: SquadPlayer, teamName: string) => {
    if (!selectedTeam) return;
    setSelectedPlayer({
      playerId: player.id,
      teamId: selectedTeam.id,
      teamName,
      competitionCode: selectedTeam.competition.code,
      initialName: player.name,
      initialPosition: player.position,
    });
    setReturnView('team');
    setView('player');
  };

  const handleSelectPlayerFromSearch = (result: PlayerSearchResult) => {
    setSelectedPlayer({
      playerId: result.id,
      teamId: result.teamId,
      teamName: result.teamName,
      competitionCode: result.competitionCode,
      initialName: result.name,
      initialPosition: result.position,
      backLabel: 'Back',
    });
    if (view !== 'player') setReturnView(view);
    setView('player');
  };

  const handleBackFromTeam = () => {
    setSelectedTeam(null);
    setView(returnView === 'competition-teams' ? 'competition-teams' : 'browse');
  };

  const handleBackFromPlayer = () => {
    setSelectedPlayer(null);
    setView(returnView);
  };

  const mainContent = () => {
    if (view === 'player' && selectedPlayer) {
      return (
        <FootballPlayerView
          playerId={selectedPlayer.playerId}
          teamId={selectedPlayer.teamId}
          teamName={selectedPlayer.teamName}
          competitionCode={selectedPlayer.competitionCode}
          initialName={selectedPlayer.initialName}
          initialPosition={selectedPlayer.initialPosition}
          backLabel={selectedPlayer.backLabel}
          onBack={handleBackFromPlayer}
        />
      );
    }

    if (view === 'team' && selectedTeam) {
      return (
        <FootballTeamView
          team={selectedTeam}
          onSelectPlayer={handleSelectPlayerFromTeam}
          onBack={handleBackFromTeam}
        />
      );
    }

    if (view === 'competition-teams') {
      return (
        <FootballTeamsGrid
          competitionCode={competitionCode}
          competitionName={competitionName}
          onSelectTeam={handleSelectTeamFromCompetition}
          onBack={() => setView('browse')}
        />
      );
    }

    // view === 'browse'
    return (
      <div className="space-y-4">
        <Tabs value={browseMode} onValueChange={(v) => setBrowseMode(v as BrowseMode)}>
          <TabsList className="h-auto w-fit rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
            <TabsTrigger
              value="competitions"
              className="gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-gray-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-green-500/25"
            >
              <Trophy className="size-3.5" /> By Competition
            </TabsTrigger>
            <TabsTrigger
              value="all-teams"
              className="gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-gray-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-green-500/25"
            >
              <Grid3x3 className="size-3.5" /> All Teams
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {browseMode === 'competitions' ? (
          <CompetitionsGrid onSelect={handleSelectCompetition} />
        ) : (
          <FootballAllTeamsGrid
            teams={allTeams}
            onTeamsLoaded={setAllTeams}
            onSelectTeam={handleSelectTeamFromAll}
          />
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        {mainContent()}
      </div>
      <div className="lg:col-span-1 lg:sticky lg:top-24 self-start">
        <FootballPlayerSearch
          onSelectPlayer={handleSelectPlayerFromSearch}
          selectedPlayerId={view === 'player' ? selectedPlayer?.playerId ?? null : null}
        />
      </div>
    </div>
  );
}
