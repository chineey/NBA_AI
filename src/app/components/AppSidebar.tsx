import { useState } from 'react';
import { TrendingUp, User, Shield, LogOut, Sparkles, ChevronsUpDown } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/app/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';

type Sport = 'nba' | 'football';
type Mode = 'players' | 'teams';

type Props = {
  sport: Sport;
  setSport: (s: Sport) => void;
  mode: Mode;
  switchMode: (m: Mode) => void;
  userEmail?: string | null;
  onSignOut: () => void;
};

export function AppSidebar({ sport, setSport, mode, switchMode, userEmail, onSignOut }: Props) {
  const isNba = sport === 'nba';
  const initial = (userEmail ?? '?').charAt(0).toUpperCase();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent active:bg-transparent">
              <div
                className={`flex items-center justify-center size-8 rounded-lg shadow-lg shrink-0 transition-all duration-500 ${
                  isNba
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/30'
                    : 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30'
                }`}
              >
                <TrendingUp className="size-4 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-bold text-white text-sm">Courtside</span>
                <span className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
                  <Sparkles className={`size-2.5 ${isNba ? 'text-orange-400' : 'text-green-400'}`} />
                  AI predictions
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sport</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isNba}
                  onClick={() => setSport('nba')}
                  tooltip="NBA"
                  className="data-[active=true]:bg-gradient-to-r data-[active=true]:from-orange-500/20 data-[active=true]:to-amber-500/10 data-[active=true]:text-orange-300 data-[active=true]:border data-[active=true]:border-orange-500/25"
                >
                  <span className="text-base leading-none">🏀</span>
                  <span>NBA</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={!isNba}
                  onClick={() => setSport('football')}
                  tooltip="Football"
                  className="data-[active=true]:bg-gradient-to-r data-[active=true]:from-green-500/20 data-[active=true]:to-emerald-500/10 data-[active=true]:text-green-300 data-[active=true]:border data-[active=true]:border-green-500/25"
                >
                  <span className="text-base leading-none">⚽</span>
                  <span>Football</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isNba && (
          <SidebarGroup>
            <SidebarGroupLabel>NBA</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={mode === 'players'}
                    onClick={() => switchMode('players')}
                    tooltip="Players"
                    className="data-[active=true]:bg-white/10 data-[active=true]:text-white"
                  >
                    <User />
                    <span>Players</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={mode === 'teams'}
                    onClick={() => switchMode('teams')}
                    tooltip="Teams"
                    className="data-[active=true]:bg-white/10 data-[active=true]:text-white"
                  >
                    <Shield />
                    <span>Teams</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <Avatar className="size-7 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-white/10 text-xs text-white">{initial}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-gray-300">{userEmail}</span>
                  <ChevronsUpDown className="ml-auto size-3.5 text-gray-500" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56 border-white/[0.08] bg-gray-900 text-gray-200">
                <DropdownMenuLabel className="truncate font-normal text-gray-400">{userEmail}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/[0.08]" />
                <DropdownMenuItem
                  onClick={() => setConfirmSignOut(true)}
                  variant="destructive"
                  className="focus:bg-red-500/10 focus:text-red-300"
                >
                  <LogOut />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="border-white/[0.08] bg-gray-900 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Courtside?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign back in to search players, browse teams, and generate predictions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/[0.08] bg-transparent text-gray-300 hover:bg-white/[0.06] hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onSignOut}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
