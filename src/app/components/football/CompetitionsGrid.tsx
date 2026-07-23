import { Trophy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/app/components/ui/skeleton';

type Competition = {
  id: number | null;
  code: string;
  name: string;
  emblem: string;
  area: string;
};

type Props = {
  onSelect: (code: string, name: string) => void;
};

export function CompetitionsGrid({ onSelect }: Props) {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_FOOTBALL_API_URL}/football/competitions`)
      .then(r => r.json())
      .then(setCompetitions)
      .catch(e => { console.error(e); toast.error('Could not load competitions', { description: 'Please refresh and try again.' }); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-9 rounded-xl bg-green-500/15 border border-green-500/20">
          <Trophy className="size-4 text-green-400" />
        </div>
        <div>
          <h2 className="font-display text-xl text-white font-bold tracking-tight">Select a Competition</h2>
          <p className="text-gray-500 text-xs">Choose a league or tournament to explore teams and stats</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 stagger-children">
        {competitions.map((comp, i) => (
          <button
            key={comp.code}
            style={{ ['--i' as any]: i }}
            onClick={() => onSelect(comp.code, comp.name)}
            className="card-lift relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-900/60 border border-white/[0.07] hover:border-green-500/50 rounded-2xl p-4 flex flex-col items-center gap-3 group hover:shadow-xl hover:shadow-green-500/10"
          >
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-28 h-28 bg-green-500/0 group-hover:bg-green-500/15 rounded-full blur-2xl transition-all duration-300" />
            <div className="relative size-16 flex items-center justify-center">
              {comp.emblem ? (
                <img
                  src={comp.emblem}
                  alt={comp.name}
                  className="size-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                />
              ) : (
                <div className="size-14 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
                  <span className="text-green-400 text-xs font-bold">{comp.code}</span>
                </div>
              )}
            </div>
            <div className="relative text-center">
              <div className="text-white font-semibold text-sm leading-tight">{comp.name}</div>
              {comp.area && (
                <div className="text-gray-500 text-[11px] font-medium tracking-widest mt-1 group-hover:text-green-400/90 transition-colors">
                  {comp.area}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
