import { Link, useLocation } from "react-router-dom";
import { useTeam } from "@/contexts/TeamContext";
import { useSession } from "@/hooks/useSession";
import ThemeToggle from "../ui/ThemeToggle";
import InboxButton from "./InboxButton";

export default function Header() {
  const { currentTeam, teams, setTeam } = useTeam();
  const { session } = useSession();
  const { pathname } = useLocation();
  
  // Debug logging
  console.log("Header: Current team:", currentTeam?.name, "ID:", currentTeam?.id);
  console.log("Header: Available teams:", teams.map(t => `${t.name} (${t.id})`));

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3">
          {currentTeam?.logo_url ? (
            <img
              src={currentTeam.logo_url}
              alt={currentTeam.name}
              className="h-8 w-8 rounded-full border border-border object-fit bg-white"
            />
          ) : (
                <div className="h-10 w-10 grid place-items-center rounded-lg border border-border bg-card text-sm font-semibold text-muted-foreground">T&E</div>          )}
          <span className="text-sm font-semibold">{currentTeam?.name}</span>
        </Link>

        {/* Simple team switcher */}
        {teams.length > 1 && (
          <select
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
            value={currentTeam?.id ?? ""}
            onChange={(e) => {
              console.log("Header: Team switcher changed to:", e.target.value);
              setTeam(e.target.value);
            }}
            aria-label="Switch team"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        <nav className="hidden lg:flex items-center gap-3">
          <Link className={linkCls(pathname === "/")} to="/">Map</Link>
          <Link className={linkCls(pathname.startsWith("/trends"))} to="/trends">Trends</Link>
          <Link className={linkCls(pathname.startsWith("/monitor"))} to="/monitor">Monitor</Link>
          <Link className={linkCls(pathname.startsWith("/dashboard"))} to="/dashboard">Dashboard</Link>
        </nav>
        <ThemeToggle />
        {session && currentTeam && <InboxButton/>}
      </div>
    </header>
  );
}

function linkCls(active: boolean) {
  return `px-2 py-1 rounded-md ${active ? "bg-primary text-white" : "hover:bg-muted"}`;
}