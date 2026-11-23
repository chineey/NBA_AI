import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-foreground">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground text-sm">▲</span>
      <span>Courtside</span>
    </div>
  );
}

export function TextAvatar({ label, big }: { label: string; big?: boolean }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return (
    <div
      className={`grid place-items-center rounded-xl bg-secondary font-display font-bold text-primary shrink-0 ${
        big ? 'size-16 text-xl' : 'size-10 text-sm'
      }`}
    >
      {initials || '?'}
    </div>
  );
}

export function StatBox({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-3 sm:p-4 min-w-0">
      <div className="truncate text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-lg sm:text-2xl font-semibold ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 truncate text-[11px] sm:text-xs text-success">{hint}</div>}
    </div>
  );
}

export function computeStatCall({
  predicted,
  avg,
  low,
  high,
  recentValues,
  isPct = false,
}: {
  predicted: number;
  avg: number;
  low?: number;
  high?: number;
  recentValues?: number[];
  isPct?: boolean;
}) {
  const isOver = predicted >= avg;
  const line = Math.ceil(avg);
  const tag = `${isOver ? 'O' : 'U'}${line}${isPct ? '%' : ''}`;

  // Estimate confidence (52%–95%) from projection interval vs avg, blended with recent hit rate.
  let intervalConf = 62;
  if (low !== undefined && high !== undefined && high > low) {
    const span = high - low;
    const raw = isOver ? (high - avg) / span : (avg - low) / span;
    intervalConf = Math.max(0.5, Math.min(0.95, raw)) * 100;
  } else if (recentValues && recentValues.length > 0) {
    const mean = recentValues.reduce((s, v) => s + v, 0) / recentValues.length;
    const variance = recentValues.reduce((s, v) => s + (v - mean) ** 2, 0) / recentValues.length;
    const std = Math.max(Math.sqrt(variance), isPct ? 2 : 0.5);
    const z = Math.abs(predicted - avg) / std;
    intervalConf = Math.min(92, 54 + z * 22);
  }

  let confidence = intervalConf;
  if (recentValues && recentValues.length > 0) {
    const hits = recentValues.filter((v) => (isOver ? v >= avg : v < avg)).length;
    const hitPct = (hits / recentValues.length) * 100;
    confidence = intervalConf * 0.7 + hitPct * 0.3;
  }

  return {
    isOver,
    line,
    tag,
    confidence: Math.round(Math.max(52, Math.min(95, confidence))),
  };
}

export function PredictionStatCard({
  label,
  value,
  rangeText,
  avgText,
  hasGenerated,
  predicted,
  avg,
  low,
  high,
  recentValues,
  isPct = false,
  accent,
}: {
  label: string;
  value: string;
  rangeText?: string;
  avgText?: string;
  hasGenerated: boolean;
  predicted: number;
  avg: number;
  low?: number;
  high?: number;
  recentValues?: number[];
  isPct?: boolean;
  accent?: boolean;
}) {
  const showCall = hasGenerated && avg > 0;
  const call = showCall
    ? computeStatCall({ predicted, avg, low, high, recentValues, isPct })
    : null;

  return (
    <div className="panel flex flex-col justify-between p-3.5 sm:p-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {call && (
          <span
            className={`num inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              call.isOver
                ? 'border-success/35 bg-success/15 text-success'
                : 'border-accent/35 bg-accent/15 text-accent'
            }`}
          >
            {call.isOver ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {call.tag}
          </span>
        )}
      </div>

      <div className={`num mt-1.5 text-xl sm:text-2xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="num truncate">{hasGenerated && rangeText ? rangeText : avgText ?? '—'}</span>
        {hasGenerated && rangeText && avgText && (
          <span className="num shrink-0 opacity-80">{avgText}</span>
        )}
      </div>

      {call && (
        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                call.isOver ? 'bg-success' : 'bg-accent'
              }`}
              style={{ width: `${call.confidence}%` }}
            />
          </div>
          <div className="num mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Confidence</span>
            <span className="font-semibold text-foreground">{call.confidence}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PillTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, string][];
}) {
  return (
    <div className="no-scrollbar inline-flex max-w-full flex-nowrap gap-1 overflow-x-auto rounded-xl bg-secondary p-1">
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-300 ${
            value === v
              ? 'glow bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Bars({
  data,
  line,
  labels,
  lineLabel,
}: {
  data: number[];
  line?: number;
  labels?: string[];
  lineLabel?: string;
}) {
  const max = Math.max(...data, line ?? 0, 1) * 1.18;
  return (
    <div>
      {/* Plot area: bars and dashed line share the exact same [0, max] baseline and height */}
      <div className="relative h-40 sm:h-44">
        {line !== undefined && line > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent z-10"
            style={{ bottom: `${(line / max) * 100}%` }}
          >
            <span className="num absolute -top-5 right-0 rounded bg-card/80 px-1 text-[11px] sm:text-xs text-accent">
              {lineLabel ?? `avg ${line.toFixed(1)}`}
            </span>
          </div>
        )}
        <div className="flex h-full items-end gap-1 sm:gap-2">
          {data.map((v, i) => {
            const pct = (v / max) * 100;
            return (
              <div key={i} className="relative h-full flex-1 min-w-0">
                <span
                  className="num pointer-events-none absolute inset-x-0 text-center text-[9px] sm:text-[10px] text-muted-foreground"
                  style={{ bottom: `calc(${pct}% + 4px)` }}
                >
                  {v}
                </span>
                <div
                  className={`absolute inset-x-0 bottom-0 grow rounded-t-md ${
                    line !== undefined && v >= line ? 'bg-primary' : 'bg-secondary'
                  }`}
                  style={{
                    height: `${Math.max(pct, 2)}%`,
                    animationDelay: `${i * 45}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {labels && labels.length > 0 && (
        <div className="mt-1.5 flex gap-1 sm:gap-2">
          {labels.map((lbl, i) => (
            <div key={i} className="flex-1 min-w-0 text-center">
              <span
                className={`num block truncate text-[8px] sm:text-[9px] text-muted-foreground ${
                  i % 2 === 1 ? 'hidden sm:block' : ''
                }`}
              >
                {lbl}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProbBar({
  h,
  d,
  a,
  homeLabel,
  awayLabel,
}: {
  h: number;
  d: number;
  a: number;
  homeLabel?: string;
  awayLabel?: string;
}) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
        <div className="fill bg-primary" style={{ width: `${h}%` }} />
        <div className="fill bg-muted-foreground/40" style={{ width: `${d}%`, animationDelay: '.15s' }} />
        <div className="fill bg-accent" style={{ width: `${a}%`, animationDelay: '.3s' }} />
      </div>
      <div className="num mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span className="text-primary">{homeLabel ? `${homeLabel} ` : ''}{h}%</span>
        <span>{d}% draw</span>
        <span className="text-accent">{awayLabel ? `${awayLabel} ` : ''}{a}%</span>
      </div>
    </div>
  );
}

export function FormBadges({ form }: { form: string }) {
  return (
    <div className="flex gap-1">
      {form.split('').map((c, i) => (
        <span
          key={i}
          className={`num grid size-5 place-items-center rounded text-[10px] font-bold ${
            c === 'W'
              ? 'bg-success/20 text-success'
              : c === 'L'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
