import { useState, useEffect } from 'react';
import {
  X, Target, BarChart3, Sparkles, Star, Users, Calendar, AlertTriangle,
  CheckCircle2, Clock, ShieldAlert, TrendingUp, Info, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/app/components/ui/badge';

interface TeamInfo {
  id: number;
  name: string;
  short_name?: string;
  shortName?: string;
  crest: string;
  tla: string;
}

interface PlayerInjury {
  name: string;
  position: string;
  status: string;
  reason: string;
  verified: boolean;
}

interface LineupPlayer {
  name: string;
  position: string;
  number: number;
}

interface DetailedAnalysis {
  matchId: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string; emblem?: string };
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  venue?: string;
  prediction: {
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    favoredCode: string;
    favoredLabel: string;
    predictedScore: string;
    confidence: string;
    expectedGoals: { home: number; away: number };
    summaryReasoning: string;
    disclaimer: string;
  };
  detailedReasoning: {
    recentForm: {
      home: {
        teamName: string;
        formString: string;
        pointsLast5: number;
        results: { opponent: string; score: string; result: string }[];
        trend: string;
      };
      away: {
        teamName: string;
        formString: string;
        pointsLast5: number;
        results: { opponent: string; score: string; result: string }[];
        trend: string;
      };
    };
    homeAwayPerformance: {
      homeTeamAtHome: {
        matches: number;
        record: string;
        goalsForAvg: number;
        goalsAgainstAvg: number;
        cleanSheetRate: string;
        homeWinRate: string;
      };
      awayTeamAway: {
        matches: number;
        record: string;
        goalsForAvg: number;
        goalsAgainstAvg: number;
        cleanSheetRate: string;
        awayWinRate: string;
      };
      insight: string;
    };
    headToHead: {
      totalMeetings: number;
      recentClashes: { date: string; home: string; away: string; score: string; comp: string }[];
      summary: string;
    };
    goalsAndDefense: {
      expectedGoals: { home: number; away: number; total: number };
      attackStrength: { home: number; away: number };
      defenseStrength: { home: number; away: number };
      over15Pct: number;
      over25Pct: number;
      under25Pct: number;
      over35Pct: number;
      bttsYesPct: number;
      bttsNoPct: number;
      cleanSheetHomePct: number;
      cleanSheetAwayPct: number;
    };
    playerAvailability: {
      homeInjuries: PlayerInjury[];
      awayInjuries: PlayerInjury[];
      verificationNotice: string;
      hasKeyAbsences: boolean;
    };
    lineups: {
      status: 'projected' | 'confirmed';
      badgeLabel: string;
      lastChecked: string;
      disclaimer: string;
      home: { team: string; formation: string; startingXI: LineupPlayer[] };
      away: { team: string; formation: string; startingXI: LineupPlayer[] };
    };
    fixtureContext: {
      homeRestDays: number;
      awayRestDays: number;
      congestionLevel: string;
      stakes: string;
    };
    keyFactors: string[];
    uncertainties: string[];
  };
  lastUpdated: string;
}

function TeamCrest({ team, size = 'md' }: { team: TeamInfo; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const sizeClasses = size === 'sm' ? 'size-6' : size === 'lg' ? 'size-14' : 'size-10';
  const name = team.short_name || team.shortName || team.name;

  if (!team.crest || failed) {
    return (
      <div className={`${sizeClasses} rounded-full bg-gray-800 border border-white/10 flex items-center justify-center shrink-0`}>
        <span className="text-gray-300 text-[10px] font-bold uppercase">{team.tla || name.slice(0, 3)}</span>
      </div>
    );
  }
  return (
    <img
      src={team.crest}
      alt={name}
      className={`${sizeClasses} object-contain shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

function FormPills({ formString }: { formString: string }) {
  if (!formString) return null;
  return (
    <div className="flex items-center gap-1">
      {formString.split('').map((char, i) => (
        <span
          key={i}
          className={`size-5 rounded flex items-center justify-center text-[10px] font-black uppercase ${
            char === 'W'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : char === 'D'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}
        >
          {char}
        </span>
      ))}
    </div>
  );
}

function formatMatchTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function MatchAnalysisModal({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [data, setData] = useState<DetailedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'lineups' | 'form' | 'stats'>('overview');
  const [copied, setCopied] = useState(false);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE}/football/matches/${matchId}/analysis`)
      .then(r => {
        if (!r.ok) return r.json().then(b => { throw new Error(b.detail ?? `Error ${r.status}`); });
        return r.json();
      })
      .then(setData)
      .catch(e => {
        console.error(e);
        setError(e.message || 'Unable to load match analysis.');
      })
      .finally(() => setLoading(false));
  }, [matchId]);

  const handleCopyPrediction = () => {
    if (!data) return;
    const homeName = data.homeTeam.short_name || data.homeTeam.shortName || data.homeTeam.name;
    const awayName = data.awayTeam.short_name || data.awayTeam.shortName || data.awayTeam.name;
    const text = `⚽ Courtside Prediction:\n${homeName} vs ${awayName}\n🏆 Pick: ${data.prediction.favoredLabel} (${Math.max(data.prediction.homeWinPct, data.prediction.awayWinPct)}%)\n📊 1X2: 1 (${data.prediction.homeWinPct}%) | X (${data.prediction.drawPct}%) | 2 (${data.prediction.awayWinPct}%)\n🎯 Predicted Score: ${data.prediction.predictedScore}\n${data.prediction.summaryReasoning}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Prediction copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const homeName = data?.homeTeam.short_name || data?.homeTeam.shortName || data?.homeTeam.name || 'Home';
  const awayName = data?.awayTeam.short_name || data?.awayTeam.shortName || data?.awayTeam.name || 'Away';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex p-2 sm:p-4 md:p-6 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 border border-white/10 rounded-2xl w-full max-w-3xl m-auto overflow-hidden shadow-2xl shadow-green-500/10 flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-gray-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400">
              <Sparkles className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-display font-bold text-base sm:text-lg tracking-tight">
                  Detailed Match Prediction Analysis
                </h3>
                {data && (
                  <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-400 text-[10px] px-2 py-0">
                    Poisson Engine
                  </Badge>
                )}
              </div>
              <p className="text-gray-400 text-xs">
                {data?.competition.name} · {data && formatMatchTime(data.utcDate)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <button
                onClick={handleCopyPrediction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-gray-300 hover:text-white hover:bg-white/10 text-xs transition-colors"
                title="Copy prediction summary"
              >
                {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Share Pick'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Loading / Error states */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="size-10 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
            <p className="text-gray-400 text-sm font-medium">Computing Poisson parameters & lineup projections...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center space-y-3">
            <ShieldAlert className="size-10 text-rose-400 mx-auto" />
            <h4 className="text-white font-semibold">Prediction Unavailable</h4>
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
        )}

        {/* Content */}
        {data && (
          <div className="overflow-y-auto p-4 sm:p-6 space-y-6 flex-1">
            {/* Match Teams Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-950 border border-white/10 p-5 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                {/* Home Team */}
                <div className="flex flex-col items-center gap-2 flex-1 text-center min-w-0">
                  <TeamCrest team={data.homeTeam} size="lg" />
                  <span className="text-white font-bold text-sm sm:text-base truncate w-full">{homeName}</span>
                  <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-gray-400">
                    Home
                  </Badge>
                  <FormPills formString={data.detailedReasoning.recentForm.home.formString} />
                </div>

                {/* Score / Time / Versus */}
                <div className="flex flex-col items-center justify-center shrink-0 px-2 sm:px-6">
                  <span className="text-xs text-gray-400 font-medium mb-1">Projected Score</span>
                  <div className="px-4 py-2 rounded-xl bg-gray-950/80 border border-white/10 text-xl sm:text-2xl font-black text-white tabular-nums tracking-wider shadow-inner">
                    {data.prediction.predictedScore}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      ★ {data.prediction.favoredLabel}
                    </span>
                  </div>
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-2 flex-1 text-center min-w-0">
                  <TeamCrest team={data.awayTeam} size="lg" />
                  <span className="text-white font-bold text-sm sm:text-base truncate w-full">{awayName}</span>
                  <Badge variant="outline" className="border-white/10 bg-white/[0.04] text-[10px] text-gray-400">
                    Away
                  </Badge>
                  <FormPills formString={data.detailedReasoning.recentForm.away.formString} />
                </div>
              </div>

              {/* 1X2 Probabilities Bar */}
              <div className="mt-6 pt-5 border-t border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-semibold text-white">Full-Time Result Probability (1X2)</span>
                  <span className="text-[11px] text-gray-500">Model Estimates · Sums to 100%</span>
                </div>

                {/* Split Bar */}
                <div className="h-3 w-full rounded-full overflow-hidden bg-gray-800 flex shadow-inner">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${data.prediction.homeWinPct}%` }}
                    title={`Home Win: ${data.prediction.homeWinPct}%`}
                  />
                  <div
                    className="bg-amber-500/80 transition-all duration-500"
                    style={{ width: `${data.prediction.drawPct}%` }}
                    title={`Draw: ${data.prediction.drawPct}%`}
                  />
                  <div
                    className="bg-sky-500 transition-all duration-500"
                    style={{ width: `${data.prediction.awayWinPct}%` }}
                    title={`Away Win: ${data.prediction.awayWinPct}%`}
                  />
                </div>

                {/* 1X2 Metric Cards */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className={`p-2.5 rounded-xl border ${data.prediction.favoredCode === '1' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/5 bg-white/[0.02]'}`}>
                    <div className="text-[11px] font-bold text-gray-400">1 · Home Win</div>
                    <div className="text-xl sm:text-2xl font-black text-emerald-400 tabular-nums">
                      {data.prediction.homeWinPct}%
                    </div>
                    <div className="text-[10px] text-gray-500">{homeName}</div>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${data.prediction.favoredCode === 'X' ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/5 bg-white/[0.02]'}`}>
                    <div className="text-[11px] font-bold text-gray-400">X · Draw</div>
                    <div className="text-xl sm:text-2xl font-black text-amber-400 tabular-nums">
                      {data.prediction.drawPct}%
                    </div>
                    <div className="text-[10px] text-gray-500">Tie</div>
                  </div>

                  <div className={`p-2.5 rounded-xl border ${data.prediction.favoredCode === '2' ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/5 bg-white/[0.02]'}`}>
                    <div className="text-[11px] font-bold text-gray-400">2 · Away Win</div>
                    <div className="text-xl sm:text-2xl font-black text-sky-400 tabular-nums">
                      {data.prediction.awayWinPct}%
                    </div>
                    <div className="text-[10px] text-gray-500">{awayName}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs for Deep Dive */}
            <div className="flex border-b border-white/[0.08] gap-4 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-2.5 transition-colors border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-green-400 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                Why This Prediction?
              </button>
              <button
                onClick={() => setActiveTab('lineups')}
                className={`pb-2.5 transition-colors border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'lineups'
                    ? 'border-green-400 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Users className="size-3.5" />
                Lineups & Availability
              </button>
              <button
                onClick={() => setActiveTab('form')}
                className={`pb-2.5 transition-colors border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'form'
                    ? 'border-green-400 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <TrendingUp className="size-3.5" />
                Form & Venue Splits
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`pb-2.5 transition-colors border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'stats'
                    ? 'border-green-400 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <BarChart3 className="size-3.5" />
                Goals & Markets
              </button>
            </div>

            {/* TAB 1: WHY THIS PREDICTION? (KEY FACTORS & UNCERTAINTIES) */}
            {activeTab === 'overview' && (
              <div className="space-y-5 animate-fade-in">
                {/* Summary Box */}
                <div className="p-4 rounded-xl bg-gray-900/60 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                    <Target className="size-4 text-emerald-400" />
                    Model Executive Summary
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {data.prediction.summaryReasoning}
                  </p>
                </div>

                {/* Key Factors vs Uncertainty Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Strongest Reasons */}
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-emerald-500/20 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <CheckCircle2 className="size-4" />
                      Key Supporting Factors
                    </div>
                    <ul className="space-y-2.5 text-xs text-gray-300">
                      {data.detailedReasoning.keyFactors.map((factor, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold shrink-0">✓</span>
                          <span>{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risks & Uncertainty */}
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-amber-500/20 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                      <AlertTriangle className="size-4" />
                      Uncertainty & Risk Factors
                    </div>
                    <ul className="space-y-2.5 text-xs text-gray-300">
                      {data.detailedReasoning.uncertainties.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-amber-400 font-bold shrink-0">!</span>
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Fixture Context */}
                <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="size-3.5 text-gray-400" />
                      Fixture Context & Fatigue
                    </span>
                    <Badge variant="outline" className="border-white/10 text-gray-400 text-[10px]">
                      {data.detailedReasoning.fixtureContext.congestionLevel}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-gray-950 border border-white/5">
                      <span className="text-gray-400 block text-[11px]">{homeName} Rest</span>
                      <span className="text-white font-bold text-sm">
                        {data.detailedReasoning.fixtureContext.homeRestDays} days rest
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-gray-950 border border-white/5">
                      <span className="text-gray-400 block text-[11px]">{awayName} Rest</span>
                      <span className="text-white font-bold text-sm">
                        {data.detailedReasoning.fixtureContext.awayRestDays} days rest
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs italic pt-1">
                    Stakes: {data.detailedReasoning.fixtureContext.stakes}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: LINEUPS & LINEUP ACCURACY */}
            {activeTab === 'lineups' && (
              <div className="space-y-5 animate-fade-in">
                {/* Lineup Accuracy Notice - Mandatory by update.md */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-start gap-3">
                  <Info className="size-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-300">
                        {data.detailedReasoning.lineups.badgeLabel}
                      </span>
                      <span className="text-gray-400 text-[11px]">
                        Checked: {data.detailedReasoning.lineups.lastChecked}
                      </span>
                    </div>
                    <p className="text-gray-300 leading-relaxed text-[11px]">
                      {data.detailedReasoning.lineups.disclaimer}
                    </p>
                  </div>
                </div>

                {/* Projected Lineups */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Home Team Starting XI */}
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TeamCrest team={data.homeTeam} size="sm" />
                        <span className="text-white font-bold text-xs">{homeName} Starting XI</span>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                        {data.detailedReasoning.lineups.home.formation}
                      </Badge>
                    </div>

                    <div className="divide-y divide-white/[0.05] text-xs">
                      {data.detailedReasoning.lineups.home.startingXI.map((player, idx) => (
                        <div key={idx} className="py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-mono text-[10px] w-4 text-right">
                              {player.number}
                            </span>
                            <span className="text-gray-200">{player.name}</span>
                          </div>
                          <span className="text-gray-500 text-[10px] uppercase font-bold">
                            {player.position}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Away Team Starting XI */}
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TeamCrest team={data.awayTeam} size="sm" />
                        <span className="text-white font-bold text-xs">{awayName} Starting XI</span>
                      </div>
                      <Badge variant="outline" className="border-sky-500/30 text-sky-400 text-[10px]">
                        {data.detailedReasoning.lineups.away.formation}
                      </Badge>
                    </div>

                    <div className="divide-y divide-white/[0.05] text-xs">
                      {data.detailedReasoning.lineups.away.startingXI.map((player, idx) => (
                        <div key={idx} className="py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-mono text-[10px] w-4 text-right">
                              {player.number}
                            </span>
                            <span className="text-gray-200">{player.name}</span>
                          </div>
                          <span className="text-gray-500 text-[10px] uppercase font-bold">
                            {player.position}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Player Availability & Absences */}
                <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>Confirmed Injuries & Doubts</span>
                    <span className="text-gray-500 text-[10px]">
                      {data.detailedReasoning.playerAvailability.verificationNotice}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Home Injuries */}
                    <div className="space-y-2">
                      <span className="text-gray-400 text-[11px] font-semibold">{homeName} Absences</span>
                      {data.detailedReasoning.playerAvailability.homeInjuries.length === 0 ? (
                        <p className="text-gray-500 text-xs italic">No major injuries reported.</p>
                      ) : (
                        data.detailedReasoning.playerAvailability.homeInjuries.map((inj, i) => (
                          <div key={i} className="p-2 rounded-lg bg-gray-950 border border-white/5 flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium">{inj.name}</div>
                              <div className="text-gray-400 text-[10px]">{inj.reason}</div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${
                                inj.status === 'Out' ? 'border-rose-500/30 text-rose-400' : 'border-amber-500/30 text-amber-400'
                              }`}
                            >
                              {inj.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Away Injuries */}
                    <div className="space-y-2">
                      <span className="text-gray-400 text-[11px] font-semibold">{awayName} Absences</span>
                      {data.detailedReasoning.playerAvailability.awayInjuries.length === 0 ? (
                        <p className="text-gray-500 text-xs italic">No major injuries reported.</p>
                      ) : (
                        data.detailedReasoning.playerAvailability.awayInjuries.map((inj, i) => (
                          <div key={i} className="p-2 rounded-lg bg-gray-950 border border-white/5 flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium">{inj.name}</div>
                              <div className="text-gray-400 text-[10px]">{inj.reason}</div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${
                                inj.status === 'Out' ? 'border-rose-500/30 text-rose-400' : 'border-amber-500/30 text-amber-400'
                              }`}
                            >
                              {inj.status}
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: FORM & VENUE SPLITS */}
            {activeTab === 'form' && (
              <div className="space-y-5 animate-fade-in">
                {/* Home vs Away Performance */}
                <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                  <div className="text-xs font-bold text-white uppercase tracking-wider">
                    Home vs Away Performance Setting
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-gray-950 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{homeName} at Home</span>
                        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                          {data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.homeWinRate} Win Rate
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        <div>Record: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.record}</span></div>
                        <div>Clean Sheets: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.cleanSheetRate}</span></div>
                        <div>Avg Goals: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.goalsForAvg}</span></div>
                        <div>Avg Conceded: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.homeTeamAtHome.goalsAgainstAvg}</span></div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-gray-950 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{awayName} on the Road</span>
                        <Badge variant="outline" className="text-sky-400 border-sky-500/30">
                          {data.detailedReasoning.homeAwayPerformance.awayTeamAway.awayWinRate} Win Rate
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                        <div>Record: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.awayTeamAway.record}</span></div>
                        <div>Clean Sheets: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.awayTeamAway.cleanSheetRate}</span></div>
                        <div>Avg Goals: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.awayTeamAway.goalsForAvg}</span></div>
                        <div>Avg Conceded: <span className="text-white font-semibold">{data.detailedReasoning.homeAwayPerformance.awayTeamAway.goalsAgainstAvg}</span></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs italic">
                    {data.detailedReasoning.homeAwayPerformance.insight}
                  </p>
                </div>

                {/* Head to Head Record */}
                <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>Head-to-Head History</span>
                    <span className="text-gray-400 text-[11px]">
                      {data.detailedReasoning.headToHead.totalMeetings} Recent Encounters
                    </span>
                  </div>

                  <div className="divide-y divide-white/[0.05] text-xs">
                    {data.detailedReasoning.headToHead.recentClashes.map((c, i) => (
                      <div key={i} className="py-2 flex items-center justify-between">
                        <span className="text-gray-400 text-[11px]">{c.date}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200">{c.home}</span>
                          <span className="px-2 py-0.5 rounded bg-gray-800 font-bold text-white tabular-nums">
                            {c.score}
                          </span>
                          <span className="text-gray-200">{c.away}</span>
                        </div>
                        <Badge variant="outline" className="text-gray-500 text-[9px] border-transparent">
                          {c.comp}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 text-xs italic">
                    {data.detailedReasoning.headToHead.summary}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: GOALS & MARKET PROBABILITIES */}
            {activeTab === 'stats' && (
              <div className="space-y-5 animate-fade-in">
                {/* Expected Goals & Strength */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-3 rounded-xl bg-gray-900/60 border border-white/5">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Home xG</span>
                    <div className="text-xl font-black text-emerald-400">
                      {data.detailedReasoning.goalsAndDefense.expectedGoals.home}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-900/60 border border-white/5">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Away xG</span>
                    <div className="text-xl font-black text-sky-400">
                      {data.detailedReasoning.goalsAndDefense.expectedGoals.away}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-900/60 border border-white/5">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">Total Match xG</span>
                    <div className="text-xl font-black text-amber-400">
                      {data.detailedReasoning.goalsAndDefense.expectedGoals.total}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-900/60 border border-white/5">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">BTTS (Goal/Goal)</span>
                    <div className="text-xl font-black text-purple-400">
                      {data.detailedReasoning.goalsAndDefense.bttsYesPct}%
                    </div>
                  </div>
                </div>

                {/* Over / Under Market Odds */}
                <div className="p-4 rounded-xl bg-gray-900/40 border border-white/10 space-y-3">
                  <div className="text-xs font-bold text-white uppercase tracking-wider">
                    Goals Over / Under Probabilities
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                    <div className="p-3 rounded-lg bg-gray-950 border border-white/5">
                      <div className="text-gray-400 text-[10px] mb-1">Over 1.5 Goals</div>
                      <div className="text-base font-bold text-emerald-400">
                        {data.detailedReasoning.goalsAndDefense.over15Pct}%
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-950 border border-white/5">
                      <div className="text-gray-400 text-[10px] mb-1">Over 2.5 Goals</div>
                      <div className="text-base font-bold text-white">
                        {data.detailedReasoning.goalsAndDefense.over25Pct}%
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-950 border border-white/5">
                      <div className="text-gray-400 text-[10px] mb-1">Under 2.5 Goals</div>
                      <div className="text-base font-bold text-white">
                        {data.detailedReasoning.goalsAndDefense.under25Pct}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clean Sheet Odds */}
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="p-3 rounded-xl bg-gray-900/40 border border-white/10">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block mb-1">{homeName} Clean Sheet</span>
                    <div className="text-lg font-bold text-emerald-400">
                      {data.detailedReasoning.goalsAndDefense.cleanSheetHomePct}%
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-900/40 border border-white/10">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block mb-1">{awayName} Clean Sheet</span>
                    <div className="text-lg font-bold text-sky-400">
                      {data.detailedReasoning.goalsAndDefense.cleanSheetAwayPct}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Disclaimer at Bottom */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-gray-500 text-center">
              {data.prediction.disclaimer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
