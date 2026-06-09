import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

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
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="size-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl text-white font-semibold">Select a Competition</h2>
        <p className="text-gray-400 text-sm mt-1">Choose a league or tournament to explore teams and stats</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {competitions.map(comp => (
          <button
            key={comp.code}
            onClick={() => onSelect(comp.code, comp.name)}
            className="bg-gray-900 border border-gray-800 hover:border-green-500/60 hover:bg-gray-800 rounded-xl p-4 flex flex-col items-center gap-3 transition-all group"
          >
            <div className="size-16 flex items-center justify-center">
              {comp.emblem ? (
                <img
                  src={comp.emblem}
                  alt={comp.name}
                  className="size-14 object-contain group-hover:scale-110 transition-transform duration-200"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                />
              ) : (
                <div className="size-14 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                  <span className="text-green-400 text-xs font-bold">{comp.code}</span>
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="text-white font-medium text-sm leading-tight">{comp.name}</div>
              {comp.area && <div className="text-gray-500 text-xs mt-0.5">{comp.area}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
