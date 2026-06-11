import { CalendarClock, Home, Plane, TrendingUp } from 'lucide-react';

export type NextGame = {
  gameDate: string;
  opponent: string;
  homeAway: string;
  matchup: string;
};

const formatGameDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const daysUntil = (iso: string): string | null => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return null;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `in ${diff} days`;
};

export function NextGameBadge({ nextGame }: { nextGame?: NextGame | null }) {
  if (!nextGame) {
    return (
      <div className="px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-right">
        <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500 mb-1">
          <CalendarClock className="size-3.5" />
          Next Game
        </div>
        <div className="text-gray-400 text-sm font-medium">Awaiting schedule</div>
        <div className="text-[11px] text-gray-600 mt-0.5">Shown once fixtures are announced</div>
      </div>
    );
  }

  const isHome = nextGame.homeAway === 'HOME';
  const countdown = daysUntil(nextGame.gameDate);

  return (
    <div className="relative overflow-hidden px-4 py-3 bg-gradient-to-br from-orange-500/15 to-amber-500/5 border border-orange-500/25 rounded-xl text-right">
      <div className="flex items-center justify-end gap-1.5 text-xs text-orange-400 font-semibold mb-1">
        <CalendarClock className="size-3.5" />
        Next Game{countdown ? <span className="text-orange-300/80 font-normal">· {countdown}</span> : null}
      </div>
      <div className="text-white font-bold tracking-tight">{nextGame.matchup}</div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400 mt-1">
        {isHome ? <Home className="size-3" /> : <Plane className="size-3" />}
        {formatGameDate(nextGame.gameDate)} · {isHome ? 'Home' : 'Away'}
      </div>
    </div>
  );
}

export function PredStatCard({
  label,
  predicted,
  low,
  high,
  format,
  revealed,
  index = 0,
}: {
  label: string;
  predicted: number;
  low?: number;
  high?: number;
  format?: (v: number) => string;
  revealed: boolean;
  index?: number;
}) {
  const fmt = format ?? ((v: number) => String(v));
  const hasRange = low !== undefined && high !== undefined;
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-b from-gray-950 to-gray-900/40 rounded-xl p-3.5 border border-white/[0.07] transition-all duration-300 hover:border-orange-500/30 ${
        revealed ? 'animate-scale-in' : ''
      }`}
      style={revealed ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <div className="text-[11px] text-gray-500 font-semibold tracking-widest mb-1.5">{label}</div>
      <div className={`text-2xl font-display font-bold tabular-nums ${revealed ? 'text-white' : 'text-gray-600'}`}>
        {fmt(predicted)}
      </div>
      {hasRange && (
        <div className="mt-2.5 space-y-1">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-orange-500/70 to-amber-400 transition-all duration-700 ease-out ${
                revealed ? 'w-full' : 'w-0'
              }`}
            />
          </div>
          <div className="text-[11px] text-gray-500 tabular-nums">
            <span className="text-orange-400/90">{fmt(low!)}</span> – <span className="text-orange-400/90">{fmt(high!)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReasoningCard({ title, reason, tip }: { title: string; reason: string; tip: string }) {
  return (
    <div className="bg-gray-900/80 rounded-2xl border border-white/[0.07] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2.5 bg-white/[0.02]">
        <div className="flex items-center justify-center size-8 rounded-lg bg-orange-500/15 border border-orange-500/20">
          <TrendingUp className="size-4 text-orange-400" />
        </div>
        <h3 className="text-white font-semibold">{title}</h3>
      </div>
      <div className="p-5">
        <div className="bg-gray-950/80 border border-white/[0.06] rounded-xl p-4 text-gray-200 text-sm leading-relaxed whitespace-pre-wrap min-h-[6rem]">
          {reason}
        </div>
        <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
          <span className="text-orange-400/80 font-semibold shrink-0">Tip:</span>
          {tip}
        </div>
      </div>
    </div>
  );
}
