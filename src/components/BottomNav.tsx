import { NavLink } from "react-router-dom";
import { cn } from "@/components/ui/cn";
import { BarChart3, Map as MapIcon, TrendingUp, UserRound, type LucideIcon } from "lucide-react";

type Item = { to: string; label: string; Icon: LucideIcon };

function NavItem({ to, label, Icon }: Item) {
  return (
    <li className="flex flex-col items-center justify-center">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            "grid place-items-center gap-1 py-1 px-2 text-xs transition-[color,opacity] duration-base ease-out-custom",
            isActive ? "text-primary" : "text-muted hover:opacity-80"
          )
        }
        aria-label={label}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
        <span className="text-[11px] leading-none">{label}</span>
      </NavLink>
    </li>
  );
}

function BrandCenter() {
  return (
    <li className="relative -mt-6 flex flex-col items-center justify-end">
      <NavLink to="/" aria-label="Home">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-white font-semibold shadow-soft">
          D
        </span>
      </NavLink>
      <span className="mt-1 text-[10px] font-semibold tracking-wide text-muted select-none">Dashboard</span>
    </li>
  );
}

export default function BottomNav() {
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 xl:hidden",
        "border-t border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75"
      )}
      role="navigation"
      aria-label="Primary"
    >
      <div className="mx-auto max-w-7xl">
        <ul className="grid grid-cols-4 items-end h-16 px-2 pb-[env(safe-area-inset-bottom)]">
          <NavItem to="/monitor" label="Monitor" Icon={BarChart3} />
          {/*<NavItem to="/" label="Map" Icon={MapIcon} />*/}
          <BrandCenter />
          <NavItem to="/trends" label="Trends" Icon={TrendingUp} />
          <NavItem to="/dashboard" label="Dashboard" Icon={UserRound} />
        </ul>
      </div>
    </nav>
  );
}
