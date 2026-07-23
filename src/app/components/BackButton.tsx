import { ArrowLeft } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/components/ui/utils';

type Props = {
  onClick: () => void;
  label?: string;
  accent?: 'orange' | 'green';
  className?: string;
};

const ACCENT_HOVER: Record<NonNullable<Props['accent']>, string> = {
  orange: 'hover:text-orange-300 hover:bg-orange-500/10',
  green: 'hover:text-green-300 hover:bg-green-500/10',
};

export function BackButton({ onClick, label = 'Back', accent = 'orange', className }: Props) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'group gap-2 rounded-full text-gray-400 hover:text-white px-3',
        ACCENT_HOVER[accent],
        className,
      )}
    >
      <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
      {label}
    </Button>
  );
}
