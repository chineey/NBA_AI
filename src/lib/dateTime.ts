export function parseLocalDateTime(iso: string): Date | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  const hasTime = /[T ]\d{2}:\d{2}/.test(trimmed);
  if (!hasTime) {
    const d = new Date(`${trimmed}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = trimmed.replace(' ', 'T') + (hasZone ? '' : 'Z');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

export function formatLocalGameDate(
  gameDate: string,
  gameTimeUTC?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = parseLocalDateTime(gameTimeUTC || gameDate);
  if (!d) return gameDate;
  return d.toLocaleDateString(undefined, options ?? { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatLocalGameDateTime(gameDate: string, gameTimeUTC?: string): string {
  const d = parseLocalDateTime(gameTimeUTC || gameDate);
  if (!d) return gameDate;
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!gameTimeUTC) return date;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}
