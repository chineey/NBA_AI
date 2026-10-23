import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, Search, ArrowRight, ShieldAlert,
  Clock, Check, Copy, Flame
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { MatchAnalysisModal } from './MatchAnalysisModal';

export interface PredictionMatch {
  matchId: number;
  utcDate: string;
  status: string;
  matchday?: number;
  competition: {
    code: string;
    name: string;
    emblem?: string;
  };
  homeTeam: {
    id: number;
    name: string;
    short_name?: string;
    shortName?: string;
    crest: string;
    tla: string;
  };
  awayTeam: {
    id: number;
    name: string;
    short_name?: string;
    shortName?: string;
    crest: string;
    tla: string;
  };
  venue?: string;
  prediction: {
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    favoredCode: string;
    favoredLabel: string;
    predictedScore: string;
    confidence: 'high' | 'medium' | 'low';
    expectedGoals: {
      home: number;
      away: number;
    };
    summaryReasoning: string;
    hasModelData: boolean;
    disclaimer?: string;
  };
  lastUpdated?: string;
}

const COMPETITION_PILLS = [
  { code: 'ALL', label: 'All Matches' },
  { code: 'PL', label: 'Premier League' },
  { code: 'CL', label: 'Champions League' },
  { code: 'PD', label: 'La Liga' },
  { code: 'SA', label: 'Serie A' },
  { code: 'BL1', label: 'Bundesliga' },
];

function TeamCrestItem({ team, size = 'sm' }: { team: PredictionMatch['homeTeam']; size?: 'sm' | 'md' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const name = team.short_name || team.shortName || team.name;
  const dimension = size === 'md' ? 'size-9' : 'size-7';

  if (!team.crest || imgFailed) {
    return (
      <div className={`${dimension} rounded-full bg-gray-800 border border-white/10 flex items-center justify-center shrink-0`}>
        <span className="text-gray-300 text-[10px] font-bold uppercase">{team.tla || name.slice(0, 3)}</span>
      </div>
    );
  }
  return (
    <img
      src={team.crest}
      alt={name}
      className={`${dimension} object-contain shrink-0`}
      onError={() => setImgFailed(true)}
    />
  );
}

function formatKickoff(utcIso: string) {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today · ${timeStr}`;
  if (isTomorrow) return `Tomorrow · ${timeStr}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${timeStr}`;
}

interface Props {
  onSelectTeam?: (team: PredictionMatch['homeTeam'], compCode: string, compName: string) => void;
  onSelectCompetition?: (code: string, name: string) => void;
}

export function FootballPredictions({ onSelectTeam, onSelectCompetition }: Props) {
  const [predictions, setPredictions] = useState<PredictionMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComp, setSelectedComp] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const BASE = import.meta.env.VITE_FOOTBALL_API_URL || import.meta.env.VITE_API_URL;

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}/football/predictions?competition_code=${selectedComp}&limit=50`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load predictions');
        return r.json();
      })
      .then((data: PredictionMatch[]) => {
        setPredictions(data);
      })
      .catch(err => {
        console.error('Error fetching predictions:', err);
        toast.error('Could not load match predictions', {
          description: 'Showing model predictions offline mode.',
        });
      })
      .finally(() => setLoading(false));
  }, [selectedComp]);

  const handleCopy = (m: PredictionMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const homeName = m.homeTeam.short_name || m.homeTeam.shortName || m.homeTeam.name;
    const awayName = m.awayTeam.short_name || m.awayTeam.shortName || m.awayTeam.name;
    const text = `⚽ Courtside Pick:\n${homeName} vs ${awayName}\n🎯 Model Pick: ${m.prediction.favoredLabel} (${Math.max(m.prediction.homeWinPct, m.prediction.awayWinPct)}%)\n📊 1X2: 1(${m.prediction.homeWinPct}%) · X(${m.prediction.drawPct}%) · 2(${m.prediction.awayWinPct}%)\n${m.prediction.summaryReasoning}`;
    navigator.clipboard.writeText(text);
    setCopiedId(m.matchId);
    toast.success('Pick copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredMatches = useMemo(() => {
    return predictions.filter(m => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const home = (m.homeTeam.short_name || m.homeTeam.shortName || m.homeTeam.name).toLowerCase();
      const away = (m.awayTeam.short_name || m.awayTeam.shortName || m.awayTeam.name).toLowerCase();
      const comp = m.competition.name.toLowerCase();
      return home.includes(q) || away.includes(q) || comp.includes(q);
    });
  }, [predictions, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Direct Landing Header: No Marketing Clutter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2.5 bg-emerald-500"></span>
            </span>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
              Match Predictions
            </h2>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
              1X2 Probabilities
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Deterministic Poisson model projections with 1X2 win probabilities and tactical breakdown.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500" />
          <Input
            type="text"
            placeholder="Search match or team..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border-white/[0.08] bg-white/[0.04] pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder:text-gray-500 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Quick Competition Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {COMPETITION_PILLS.map(p => (
          <button
            key={p.code}
            onClick={() => setSelectedComp(p.code)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 border ${
              selectedComp === p.code
                ? 'bg-gradient-to-r from-emerald-600 to-green-500 text-white border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-white/[0.03] text-gray-400 border-white/[0.08] hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Predictions Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-gray-900/40 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
              <Skeleton className="h-12 w-full rounded" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-white/10 bg-gray-900/40 space-y-3">
          <ShieldAlert className="size-10 text-gray-500 mx-auto" />
          <h3 className="text-white font-semibold">No matches found</h3>
          <p className="text-gray-400 text-xs">
            Try choosing a different competition or clear your search query.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredMatches.map(m => {
            const homeName = m.homeTeam.short_name || m.homeTeam.shortName || m.homeTeam.name;
            const awayName = m.awayTeam.short_name || m.awayTeam.shortName || m.awayTeam.name;
            const pred = m.prediction;

            return (
              <div
                key={m.matchId}
                onClick={() => setSelectedMatchId(m.matchId)}
                className="group relative rounded-2xl border border-white/[0.08] bg-gradient-to-b from-gray-900/90 to-gray-950 p-5 hover:border-emerald-500/40 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col justify-between cursor-pointer"
              >
                {/* Card Top: Competition & Kickoff Time */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06] text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onSelectCompetition?.(m.competition.code, m.competition.name);
                      }}
                      className="font-medium text-gray-400 hover:text-emerald-400 transition-colors truncate max-w-[150px]"
                    >
                      {m.competition.name}
                    </button>
                    {m.matchday && <span className="text-gray-600">· Md {m.matchday}</span>}
                  </div>

                  <div className="flex items-center gap-1 text-gray-400 shrink-0">
                    <Clock className="size-3.5 text-gray-500" />
                    <span className="font-medium text-[11px]">{formatKickoff(m.utcDate)}</span>
                  </div>
                </div>

                {/* Teams Row */}
                <div className="py-4 flex items-center justify-between gap-3">
                  {/* Home Team */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <TeamCrestItem team={m.homeTeam} size="md" />
                    <div className="min-w-0">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectTeam?.(m.homeTeam, m.competition.code, m.competition.name);
                        }}
                        className="text-white font-bold text-sm sm:text-base hover:text-emerald-400 hover:underline transition-colors truncate block text-left"
                      >
                        {homeName}
                      </button>
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Home</span>
                    </div>
                  </div>

                  {/* Projected Score & VS */}
                  <div className="flex flex-col items-center justify-center shrink-0 px-2 text-center">
                    <span className="text-[11px] font-mono font-bold text-gray-400 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/5 tabular-nums">
                      {pred.predictedScore}
                    </span>
                    <span className="text-[9px] text-gray-500 uppercase mt-0.5">Est. Score</span>
                  </div>

                  {/* Away Team */}
                  <div className="flex items-center gap-2.5 flex-1 justify-end min-w-0 text-right">
                    <div className="min-w-0">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectTeam?.(m.awayTeam, m.competition.code, m.competition.name);
                        }}
                        className="text-white font-bold text-sm sm:text-base hover:text-emerald-400 hover:underline transition-colors truncate block text-right"
                      >
                        {awayName}
                      </button>
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Away</span>
                    </div>
                    <TeamCrestItem team={m.awayTeam} size="md" />
                  </div>
                </div>

                {/* 1X2 Probabilities Box - Mandatory First Page Display */}
                <div className="space-y-2 py-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-gray-300 flex items-center gap-1">
                      <Flame className="size-3 text-amber-400" />
                      1X2 Match Result Odds
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      ★ Pick: {pred.favoredLabel}
                    </span>
                  </div>

                  {/* 1, X, 2 Percentage Badges */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {/* 1 - Home Win */}
                    <div
                      className={`p-2 rounded-xl border transition-all ${
                        pred.favoredCode === '1'
                          ? 'border-emerald-500/50 bg-emerald-500/15 shadow-sm shadow-emerald-500/10'
                          : 'border-white/[0.06] bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">1 (Home)</span>
                      <span className={`text-lg sm:text-xl font-black tabular-nums ${pred.favoredCode === '1' ? 'text-emerald-400' : 'text-gray-200'}`}>
                        {pred.homeWinPct}%
                      </span>
                    </div>

                    {/* X - Draw */}
                    <div
                      className={`p-2 rounded-xl border transition-all ${
                        pred.favoredCode === 'X'
                          ? 'border-amber-500/50 bg-amber-500/15 shadow-sm shadow-amber-500/10'
                          : 'border-white/[0.06] bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">X (Draw)</span>
                      <span className={`text-lg sm:text-xl font-black tabular-nums ${pred.favoredCode === 'X' ? 'text-amber-400' : 'text-gray-200'}`}>
                        {pred.drawPct}%
                      </span>
                    </div>

                    {/* 2 - Away Win */}
                    <div
                      className={`p-2 rounded-xl border transition-all ${
                        pred.favoredCode === '2'
                          ? 'border-sky-500/50 bg-sky-500/15 shadow-sm shadow-sky-500/10'
                          : 'border-white/[0.06] bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">2 (Away)</span>
                      <span className={`text-lg sm:text-xl font-black tabular-nums ${pred.favoredCode === '2' ? 'text-sky-400' : 'text-gray-200'}`}>
                        {pred.awayWinPct}%
                      </span>
                    </div>
                  </div>

                  {/* Horizontal Visual Stacked Bar */}
                  <div className="h-1.5 w-full rounded-full overflow-hidden bg-gray-800 flex mt-1">
                    <div className="bg-emerald-500" style={{ width: `${pred.homeWinPct}%` }} />
                    <div className="bg-amber-500/80" style={{ width: `${pred.drawPct}%` }} />
                    <div className="bg-sky-500" style={{ width: `${pred.awayWinPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 pt-0.5">
                    <span>Model estimates · Not guarantees</span>
                    <span>Sums to ~100%</span>
                  </div>
                </div>

                {/* Concise "Why this prediction?" Summary on Card */}
                <div className="pt-2 pb-3">
                  <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed bg-white/[0.02] p-2.5 rounded-lg border border-white/5">
                    <span className="text-emerald-400 font-bold mr-1">Why pick:</span>
                    {pred.summaryReasoning}
                  </p>
                </div>

                {/* Card Action Row: Read Full Analysis & Copy Pick */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <button
                    onClick={e => handleCopy(m, e)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-colors"
                  >
                    {copiedId === m.matchId ? (
                      <>
                        <Check className="size-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        <span>Share Pick</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setSelectedMatchId(m.matchId)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 group-hover:translate-x-0.5 transition-all"
                  >
                    <span>Read Full Analysis</span>
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deep Dive Analysis Modal */}
      {selectedMatchId !== null && (
        <MatchAnalysisModal
          matchId={selectedMatchId}
          onClose={() => setSelectedMatchId(null)}
        />
      )}
    </div>
  );
}
