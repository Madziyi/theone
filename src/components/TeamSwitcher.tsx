// src/components/TeamSwitcher.tsx
import { useTeam } from "@/contexts/TeamContext";

export default function TeamSwitcher() {
  const { loading, teams, currentTeamId, setTeam } = useTeam();

  if (loading) {
    return (
      <div className="h-9 min-w-[140px] animate-pulse rounded-lg border border-border bg-card" />
    );
  }
  if (teams.length === 0) return null;

  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-xs text-muted">Team</span>
      <select
        className="h-9 min-w-[180px] rounded-lg border border-border bg-background px-2 text-sm"
        value={currentTeamId ?? ""}
        onChange={(e) => setTeam(e.target.value)}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}