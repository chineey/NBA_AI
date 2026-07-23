import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { cn } from '@/app/components/ui/utils';

type Props = {
  playerId: number;
  name: string;
  size?: 'sm' | 'lg';
  className?: string;
};

export function PlayerPhoto({ playerId, name, size = 'sm', className = '' }: Props) {
  const dim = size === 'lg' ? 'size-20 border border-gray-700' : 'size-10';

  return (
    <Avatar className={cn(dim, 'bg-gray-800', className)}>
      <AvatarImage
        src={`https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`}
        alt={name}
        className="object-cover object-top"
      />
      <AvatarFallback className="flex-col gap-0.5 bg-gray-800">
        <User className={size === 'lg' ? 'size-7 text-gray-600' : 'size-4 text-gray-500'} />
        {size === 'lg' && <span className="text-[10px] leading-none text-gray-600">Not Found</span>}
      </AvatarFallback>
    </Avatar>
  );
}
