// src/contexts/TeamContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Team = { id: string; name: string; logo_url: string | null; role: "manager" | "member" };
type Ctx = {
  teams: Team[];
  currentTeamId: string | null;
  currentTeam: Team | null;
  setTeam: (id: string) => void;
  isManager: boolean;
  loading: boolean;
};

const TeamContext = createContext<Ctx | undefined>(undefined);

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(() => localStorage.getItem("team_id"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("TeamContext: Starting to fetch team data...");
      setLoading(true);
      const { data, error } = await supabase
        .from("team_members")
        .select("role, teams:team_id ( id, name, logo_url )")
        .order("joined_at", { ascending: true });
      if (!cancelled) {
        if (error) { 
          console.error("TeamContext: Error fetching teams", error);
          setTeams([]); 
          setLoading(false); 
          return; 
        }
        const list =
          (data ?? []).map((r: any) => ({
            id: r.teams?.id,
            name: r.teams?.name,
            logo_url: r.teams?.logo_url ?? null,
            role: r.role as "manager" | "member",
          })).filter((t) => !!t.id) as Team[];
        
        console.log("TeamContext: Fetched teams list:", list);
        setTeams(list);
        if (!currentTeamId && list.length) {
          const newTeamId = list[0].id;
          console.log(`TeamContext: No current team found, setting to first team: ${newTeamId}`);
          setCurrentTeamId(newTeamId);
          localStorage.setItem("team_id", newTeamId);
        } else {
            console.log("TeamContext: Current team ID is already set:", currentTeamId);
        }
        setLoading(false);
        console.log("TeamContext: Finished fetching team data.");
      }
    })();
    return () => { 
        cancelled = true; 
        console.log("TeamContext: Cleanup function called, aborting fetch.");
    };
  }, []);

  const currentTeam = useMemo(() => teams.find(t => t.id === currentTeamId) ?? null, [teams, currentTeamId]);
  const isManager = currentTeam?.role === "manager";

  const setTeam = (id: string) => {
    console.log("TeamContext: Setting current team ID to:", id);
    setCurrentTeamId(id);
    localStorage.setItem("team_id", id);
  };

  const value: Ctx = { teams, currentTeamId, currentTeam, setTeam, isManager, loading };
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}