import type { ReactNode } from 'react';

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
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-2xl font-semibold ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-success">{hint}</div>}
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
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-300 ${
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
  const max = Math.max(...data, line ?? 0, 1) * 1.15;
  return (
    <div className="relative flex h-44 items-end gap-2 pt-6">
      {line !== undefined && line > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent z-10"
          style={{ bottom: `${Math.min((line / max) * 100, 96)}%` }}
        >
          <span className="num absolute -top-5 right-0 text-xs text-accent">
            {lineLabel ?? `avg ${line.toFixed(1)}`}
          </span>
        </div>
      )}
      {data.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1 min-w-0">
          <span className="num text-[10px] text-muted-foreground">{v}</span>
          <div
            className={`w-full grow rounded-t-md ${
              line !== undefined && v >= line ? 'bg-primary' : 'bg-secondary'
            }`}
            style={{
              height: `${Math.max((v / max) * 130, 4)}px`,
              animationDelay: `${i * 45}ms`,
            }}
          />
          {labels?.[i] && (
            <span className="num truncate max-w-full text-[9px] text-muted-foreground">{labels[i]}</span>
          )}
        </div>
      ))}
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
