import { useState, useEffect } from 'react';
import { Grid3x3, Trophy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { CompetitionsGrid } from './CompetitionsGrid';
import { FootballTeamsGrid, type FootballTeam } from './FootballTeamsGrid';
import { FootballAllTeamsGrid, type TeamEntry } from './FootballAllTeamsGrid';
import { FootballTeamView, type SquadPlayer } from './FootballTeamView';
import { FootballPlayerView } from './FootballPlayerView';
import { FootballPlayerSearch, type PlayerSearchResult } from './FootballPlayerSearch';
import { FootballLeaders, type LeaderEntry } from './FootballLeaders';
import { FootballFixtures } from './FootballFixtures';

export type FootballSection = 'browse' | 'fixtures' | 'scorers' | 'assists';

type View = 'browse' | 'competition-teams' | 'team' | 'player' | 'leaders' | 'fixtures';
type BrowseMode = 'competitions' | 'all-teams';

type TeamRef = { id: number; name: string; shortName: string; tla: string; crest: string };

type SelectedTeam = TeamRef & {
  competition: { code: string; name: string };
};

type SelectedPlayer = {
  playerId: number; teamId: number; teamName: string; competitionCode: string;
  initialName: string; initialPosition: string; backLabel?: string;
};

type Props = {
  section: FootballSection;
};

const defaultViewForSection = (section: FootballSection): View =>
  section === 'browse' ? 'browse' : section === 'fixtures' ? 'fixtures' : 'leaders';

export function FootballApp({ section }: Props) {
  const [view, setView] = useState<View>('browse');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('competitions');

  const [competitionCode, setCompetitionCode] = useState('');
  const [competitionName, setCompetitionName] = useState('');
  const [allTeams, setAllTeams] = useState<TeamEntry[]>([]);

  const [selectedTeam, setSelectedTeam] = useState<SelectedTeam | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);

  // A real navigation stack: team/league/player links can now be clicked
  // from many places (fixtures, search, leaders, player header), not just
  // the one view that used to lead there, so "back" has to unwind however
  // deep the user actually went rather than a single hardcoded parent.
  const [viewStack, setViewStack] = useState<View[]>([]);

  const leaderStat: 'goals' | 'assists' = section === 'assists' ? 'assists' : 'goals';

  // Sidebar-driven navigation: switching section jumps to that top-level view.
  useEffect(() => {
    setSelectedTeam(null);
    setSelectedPlayer(null);
    setViewStack([]);
    setView(defaultViewForSection(section));
  }, [section]);

  const goTo = (next: View) => {
    setViewStack(s => [...s, view]);
    setView(next);
  };

  const goBack = () => {
    setViewStack(s => {
      const prev = s[s.length - 1] ?? defaultViewForSection(section);
      setView(prev);
      return s.length ? s.slice(0, -1) : s;
    });
  };

  const handleSelectCompetition = (code: string, name: string) => {
    setCompetitionCode(code);
    setCompetitionName(name);
    goTo('competition-teams');
  };

  const handleSelectTeam = (team: TeamRef, teamCompetitionCode: string, teamCompetitionName: string) => {
    setSelectedTeam({ ...team, competition: { code: teamCompetitionCode, name: teamCompetitionName } });
    goTo('team');
  };

  const handleSelectTeamFromCompetition = (team: FootballTeam) =>
    handleSelectTeam(team, competitionCode, competitionName);

  const handleSelectTeamFromAll = (team: TeamEntry) =>
    handleSelectTeam(team, team.competition.code, team.competition.name);

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
    goTo('player');
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
    // The search panel is visible on every view, so picking another player
    // while already on 'player' replaces the current view instead of
    // stacking a new one (there'd be nothing meaningful to "go back" to).
    if (view !== 'player') goTo('player');
  };

  const handleSelectPlayerFromLeaders = (result: LeaderEntry) => {
    setSelectedPlayer({
      playerId: result.playerId,
      teamId: result.teamId,
      teamName: result.teamName,
      competitionCode: result.competitionCode,
      initialName: result.name,
      initialPosition: result.position,
      backLabel: `Back to ${leaderStat === 'goals' ? 'Top Scorers' : 'Top Assists'}`,
    });
    goTo('player');
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
          onBack={goBack}
          onSelectTeam={() => handleSelectTeam(
            { id: selectedPlayer.teamId, name: selectedPlayer.teamName, shortName: selectedPlayer.teamName, tla: '', crest: '' },
            selectedPlayer.competitionCode,
            '',
          )}
        />
      );
    }

    if (view === 'leaders') {
      return (
        <FootballLeaders
          stat={leaderStat}
          onSelectPlayer={handleSelectPlayerFromLeaders}
          onSelectTeam={entry => handleSelectTeam(
            { id: entry.teamId, name: entry.teamName, shortName: entry.teamName, tla: '', crest: entry.teamCrest },
            entry.competitionCode,
            '',
          )}
        />
      );
    }

    if (view === 'fixtures') {
      return (
        <FootballFixtures
          onSelectTeam={(team, compCode, compName) => handleSelectTeam(team, compCode, compName)}
          onSelectCompetition={handleSelectCompetition}
        />
      );
    }

    if (view === 'team' && selectedTeam) {
      return (
        <FootballTeamView
          team={selectedTeam}
          onSelectPlayer={handleSelectPlayerFromTeam}
          onBack={goBack}
        />
      );
    }

    if (view === 'competition-teams') {
      return (
        <FootballTeamsGrid
          competitionCode={competitionCode}
          competitionName={competitionName}
          onSelectTeam={handleSelectTeamFromCompetition}
          onBack={goBack}
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
          onSelectTeam={result => handleSelectTeam(
            { id: result.teamId, name: result.teamName, shortName: result.teamName, tla: '', crest: result.teamCrest },
            result.competitionCode,
            result.competitionName,
          )}
          selectedPlayerId={view === 'player' ? selectedPlayer?.playerId ?? null : null}
        />
      </div>
    </div>
  );
}
