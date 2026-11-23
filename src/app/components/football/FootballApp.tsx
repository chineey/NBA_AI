import { useEffect, useRef, useState } from 'react';
import { PillTabs } from '../DesignPrimitives';
import { CompetitionsGrid } from './CompetitionsGrid';
import { FootballTeamsGrid, type FootballTeam } from './FootballTeamsGrid';
import { FootballAllTeamsGrid, type TeamEntry } from './FootballAllTeamsGrid';
import { FootballTeamView, type SquadPlayer } from './FootballTeamView';
import { FootballPlayerView } from './FootballPlayerView';
import { FootballLeaders, type LeaderEntry } from './FootballLeaders';
import { FootballFixtures } from './FootballFixtures';
import { FootballPredictions } from './FootballPredictions';
import { FootballPlayerSearch, type PlayerSearchResult } from './FootballPlayerSearch';

export type FootballSection = 'predictions' | 'results' | 'scorers' | 'assists' | 'browse' | 'search';

type View =
  | { k: 'competition'; code: string; name: string }
  | { k: 'team'; team: TeamRef; competitionCode: string; competitionName: string }
  | {
      k: 'player';
      playerId: number;
      teamId: number;
      teamName: string;
      competitionCode: string;
      initialName: string;
      initialPosition: string;
      backLabel?: string;
    };

type BrowseMode = 'competitions' | 'all-teams';

type TeamRef = { id: number; name: string; shortName: string; tla: string; crest: string };

export function FootballApp() {
  const [tab, setTab] = useState<FootballSection>('predictions');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('competitions');
  const [allTeams, setAllTeams] = useState<TeamEntry[]>([]);
  const [stack, setStack] = useState<View[]>([]);
  const fbDepthRef = useRef(0);

  const pushFbHistory = (nextTab: FootballSection, nextBrowse: BrowseMode, nextStack: View[]) => {
    fbDepthRef.current += 1;
    const prevAppNav = window.history.state?.appNav || { sport: 'football' };
    window.history.pushState(
      {
        appNav: { ...prevAppNav, sport: 'football' },
        fbNav: { tab: nextTab, browseMode: nextBrowse, stack: nextStack },
      },
      '',
    );
  };

  useEffect(() => {
    const curState = window.history.state || {};
    if (!curState.fbNav) {
      window.history.replaceState(
        {
          ...curState,
          fbNav: { tab: 'predictions', browseMode: 'competitions', stack: [] },
        },
        '',
      );
    }
    const onPopState = (e: PopStateEvent) => {
      const fb = e.state?.fbNav;
      if (!fb) {
        setStack([]);
        return;
      }
      fbDepthRef.current = Math.max(0, fbDepthRef.current - 1);
      setTab(fb.tab ?? 'predictions');
      setBrowseMode(fb.browseMode ?? 'competitions');
      setStack(Array.isArray(fb.stack) ? fb.stack : []);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const push = (v: View) => {
    const nextStack = [...stack, v];
    setStack(nextStack);
    pushFbHistory(tab, browseMode, nextStack);
  };
  const pop = () => {
    if (fbDepthRef.current > 0 && stack.length > 0) {
      window.history.back();
    } else {
      setStack((s) => s.slice(0, -1));
    }
  };
  const top = stack[stack.length - 1];

  const handleSelectCompetition = (code: string, name: string) => {
    push({ k: 'competition', code, name });
  };

  const handleSelectTeam = (team: TeamRef, competitionCode: string, competitionName: string) => {
    push({ k: 'team', team, competitionCode, competitionName });
  };

  const handleSelectTeamFromCompetition = (team: FootballTeam, compCode: string, compName: string) =>
    handleSelectTeam(team, compCode, compName);

  const handleSelectTeamFromAll = (team: TeamEntry) =>
    handleSelectTeam(team, team.competition.code, team.competition.name);

  const handleSelectPlayerFromTeam = (
    player: SquadPlayer,
    teamId: number,
    teamName: string,
    competitionCode: string,
  ) => {
    push({
      k: 'player',
      playerId: player.id,
      teamId,
      teamName,
      competitionCode,
      initialName: player.name,
      initialPosition: player.position,
    });
  };

  const handleSelectPlayerFromLeaders = (result: LeaderEntry) => {
    push({
      k: 'player',
      playerId: result.playerId,
      teamId: result.teamId,
      teamName: result.teamName,
      competitionCode: result.competitionCode,
      initialName: result.name,
      initialPosition: result.position,
      backLabel: tab === 'assists' ? 'Top Assists' : 'Top Scorers',
    });
  };

  const handleSelectPlayerFromSearch = (result: PlayerSearchResult) => {
    push({
      k: 'player',
      playerId: result.playerId,
      teamId: result.teamId,
      teamName: result.teamName,
      competitionCode: result.competitionCode,
      initialName: result.name,
      initialPosition: result.position,
      backLabel: 'Player Search',
    });
  };

  const handleTabChange = (next: FootballSection) => {
    if (next === tab && stack.length === 0) return;
    setStack([]);
    setTab(next);
    pushFbHistory(next, browseMode, []);
  };

  const handleBrowseModeChange = (next: BrowseMode) => {
    if (next === browseMode) return;
    setBrowseMode(next);
    pushFbHistory(tab, next, stack);
  };

  if (top?.k === 'competition') {
    return (
      <div className="rise">
        <FootballTeamsGrid
          competitionCode={top.code}
          competitionName={top.name}
          onSelectTeam={(t) => handleSelectTeamFromCompetition(t, top.code, top.name)}
          onBack={pop}
        />
      </div>
    );
  }

  if (top?.k === 'team') {
    return (
      <div className="rise">
        <FootballTeamView
          team={{ ...top.team, competition: { code: top.competitionCode, name: top.competitionName } }}
          onSelectPlayer={(player, teamName) =>
            handleSelectPlayerFromTeam(player, top.team.id, teamName, top.competitionCode)
          }
          onBack={pop}
        />
      </div>
    );
  }

  if (top?.k === 'player') {
    return (
      <div className="rise">
        <FootballPlayerView
          playerId={top.playerId}
          teamId={top.teamId}
          teamName={top.teamName}
          competitionCode={top.competitionCode}
          initialName={top.initialName}
          initialPosition={top.initialPosition}
          backLabel={top.backLabel}
          onBack={pop}
          onSelectTeam={() =>
            handleSelectTeam(
              { id: top.teamId, name: top.teamName, shortName: top.teamName, tla: '', crest: '' },
              top.competitionCode,
              '',
            )
          }
        />
      </div>
    );
  }

  return (
    <div key={tab} className="rise space-y-6">
      <PillTabs
        value={tab}
        onChange={handleTabChange}
        items={[
          ['predictions', 'Predictions'],
          ['results', 'Results'],
          ['scorers', 'Top scorers'],
          ['assists', 'Top assists'],
          ['browse', 'Browse'],
          ['search', 'Players'],
        ]}
      />

      {tab === 'predictions' && (
        <FootballPredictions
          onSelectTeam={handleSelectTeam}
          onSelectCompetition={handleSelectCompetition}
        />
      )}

      {tab === 'results' && (
        <FootballFixtures
          onSelectTeam={handleSelectTeam}
          onSelectCompetition={handleSelectCompetition}
        />
      )}

      {(tab === 'scorers' || tab === 'assists') && (
        <FootballLeaders
          stat={tab === 'assists' ? 'assists' : 'goals'}
          onSelectPlayer={handleSelectPlayerFromLeaders}
          onSelectTeam={(entry) =>
            handleSelectTeam(
              {
                id: entry.teamId,
                name: entry.teamName,
                shortName: entry.teamName,
                tla: '',
                crest: entry.teamCrest,
              },
              entry.competitionCode,
              '',
            )
          }
        />
      )}

      {tab === 'browse' && (
        <div className="space-y-4">
          <PillTabs
            value={browseMode}
            onChange={handleBrowseModeChange}
            items={[
              ['competitions', 'By competition'],
              ['all-teams', 'All teams'],
            ]}
          />
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
      )}

      {tab === 'search' && <FootballPlayerSearch onSelectPlayer={handleSelectPlayerFromSearch} />}
    </div>
  );
}
