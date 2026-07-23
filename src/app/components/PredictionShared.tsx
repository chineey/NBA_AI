import { CalendarClock, Home, Plane, Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';

export type Accent = 'orange' | 'green';

const ACCENT = {
  orange: {
    badgeGradient: 'from-orange-500/15 to-amber-500/5',
    badgeBorder: 'border-orange-500/25',
    text: 'text-orange-400',
    textSoft: 'text-orange-300/80',
    iconChip: 'bg-orange-500/15 border-orange-500/20',
    icon: 'text-orange-400',
    cardHoverBorder: 'hover:border-orange-500/30',
    barGradient: 'from-orange-500/70 to-amber-400',
    rangeText: 'text-orange-400/90',
    tip: 'text-orange-400/80',
    ctaGradient: 'from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 shadow-orange-500/25 hover:shadow-orange-500/40',
  },
  green: {
    badgeGradient: 'from-green-500/15 to-emerald-500/5',
    badgeBorder: 'border-green-500/25',
    text: 'text-green-400',
    textSoft: 'text-green-300/80',
    iconChip: 'bg-green-500/15 border-green-500/20',
    icon: 'text-green-400',
    cardHoverBorder: 'hover:border-green-500/30',
    barGradient: 'from-green-500/70 to-emerald-400',
    rangeText: 'text-green-400/90',
    tip: 'text-green-400/80',
    ctaGradient: 'from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 shadow-green-500/25 hover:shadow-green-500/40',
  },
} as const;

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

export function NextGameBadge({ nextGame, accent = 'orange' }: { nextGame?: NextGame | null; accent?: Accent }) {
  const a = ACCENT[accent];

  if (!nextGame) {
    return (
      <Card className="gap-1 border-white/[0.08] bg-white/[0.03] px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5 text-xs text-gray-500">
          <CalendarClock className="size-3.5" />
          Next Game
        </div>
        <div className="text-sm font-medium text-gray-400">Awaiting schedule</div>
        <div className="text-[11px] text-gray-600">Shown once fixtures are announced</div>
      </Card>
    );
  }

  const isHome = nextGame.homeAway === 'HOME';
  const countdown = daysUntil(nextGame.gameDate);

  return (
    <Card className={cn('gap-1 overflow-hidden border bg-gradient-to-br px-4 py-3 text-right', a.badgeGradient, a.badgeBorder)}>
      <div className={cn('flex items-center justify-end gap-1.5 text-xs font-semibold', a.text)}>
        <CalendarClock className="size-3.5" />
        Next Game{countdown ? <span className={cn('font-normal', a.textSoft)}>· {countdown}</span> : null}
      </div>
      <div className="font-bold tracking-tight text-white">{nextGame.matchup}</div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400">
        {isHome ? <Home className="size-3" /> : <Plane className="size-3" />}
        {formatGameDate(nextGame.gameDate)} · {isHome ? 'Home' : 'Away'}
      </div>
    </Card>
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
  accent = 'orange',
}: {
  label: string;
  predicted: number;
  low?: number;
  high?: number;
  format?: (v: number) => string;
  revealed: boolean;
  index?: number;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  const fmt = format ?? ((v: number) => String(v));
  const hasRange = low !== undefined && high !== undefined;
  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden border-white/[0.07] bg-gradient-to-b from-gray-950 to-gray-900/40 p-3.5 transition-all duration-300',
        a.cardHoverBorder,
        revealed && 'animate-scale-in',
      )}
      style={revealed ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      <div className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-500">{label}</div>
      <div className={cn('font-display text-2xl font-bold tabular-nums', revealed ? 'text-white' : 'text-gray-600')}>
        {fmt(predicted)}
      </div>
      {hasRange && (
        <div className="mt-2.5 space-y-1">
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out', a.barGradient, revealed ? 'w-full' : 'w-0')}
            />
          </div>
          <div className="text-[11px] tabular-nums text-gray-500">
            <span className={a.rangeText}>{fmt(low!)}</span> – <span className={a.rangeText}>{fmt(high!)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ReasoningCard({ title, reason, tip, accent = 'orange' }: { title: string; reason: string; tip: string; accent?: Accent }) {
  const a = ACCENT[accent];
  return (
    <Card className="gap-0 overflow-hidden border-white/[0.07] bg-gray-900/80 py-0">
      <CardHeader className="flex-row items-center gap-2.5 border-b border-white/[0.06] bg-white/[0.02] py-4">
        <div className={cn('flex size-8 items-center justify-center rounded-lg border', a.iconChip)}>
          <TrendingUp className={cn('size-4', a.icon)} />
        </div>
        <CardTitle className="text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-5">
        <div className="min-h-[6rem] whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-gray-950/80 p-4 text-sm leading-relaxed text-gray-200">
          {reason}
        </div>
        <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
          <span className={cn('shrink-0 font-semibold', a.tip)}>Tip:</span>
          {tip}
        </div>
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  icon,
  title,
  subtitle,
  action,
  accent = 'orange',
  children,
  className,
  contentClassName,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  accent?: Accent;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const a = ACCENT[accent];
  return (
    <Card className={cn('gap-0 overflow-hidden border-white/[0.07] bg-gray-900/80 py-0', className)}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] py-4">
        <div className="flex items-center gap-2.5">
          <div className={cn('flex size-8 items-center justify-center rounded-lg border', a.iconChip)}>{icon}</div>
          <div>
            <CardTitle className="text-white">{title}</CardTitle>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn('py-5', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function GradientButton({
  onClick,
  loading,
  children,
  accent = 'orange',
  disabled,
}: {
  onClick: () => void;
  loading?: boolean;
  children: React.ReactNode;
  accent?: Accent;
  disabled?: boolean;
}) {
  const a = ACCENT[accent];
  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn('gap-2 rounded-full bg-gradient-to-r font-bold text-white shadow-lg transition-all active:scale-[0.97]', a.ctaGradient)}
    >
      {children}
    </Button>
  );
}

export function GenerateButton({
  onClick,
  loading,
  hasGenerated,
  accent = 'orange',
}: {
  onClick: () => void;
  loading: boolean;
  hasGenerated: boolean;
  accent?: Accent;
}) {
  return (
    <GradientButton onClick={onClick} loading={loading} accent={accent}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {loading ? 'Analyzing...' : hasGenerated ? 'Regenerate' : 'Generate AI Prediction'}
    </GradientButton>
  );
}

export function InfoChip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-medium',
        accent
          ? 'border-orange-500/25 bg-orange-500/10 font-semibold text-orange-300'
          : 'border-white/[0.08] bg-white/[0.04] text-gray-300',
      )}
    >
      {children}
    </Badge>
  );
}
