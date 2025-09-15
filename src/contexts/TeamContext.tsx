// src/contexts/TeamContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Team = { id: string; name: string; logo_url: string | null; role: "admin" | "member" };
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
      
      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("TeamContext: No user found, setting empty teams");
        setTeams([]);
        setLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from("team_members")
        .select("role, teams:team_id ( id, name, logo_url )")
        .eq("user_id", user.id)
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
            role: r.role as "admin" | "member",
          })).filter((t) => !!t.id) as Team[];
        
        // Deduplicate teams by ID, keeping the first occurrence
        const uniqueTeams = list.reduce((acc: Team[], current) => {
          if (!acc.find(team => team.id === current.id)) {
            acc.push(current);
          }
          return acc;
        }, []);
        
        console.log("TeamContext: Fetched teams list:", uniqueTeams);
        setTeams(uniqueTeams);
        
        if (uniqueTeams.length === 0) {
          // User has no teams, clear currentTeamId
          console.log("TeamContext: User has no teams, clearing currentTeamId");
          setCurrentTeamId(null);
          localStorage.removeItem("team_id");
        } else if (!currentTeamId) {
          // No current team set, use first available team
          const newTeamId = uniqueTeams[0].id;
          console.log(`TeamContext: No current team found, setting to first team: ${newTeamId}`);
          setCurrentTeamId(newTeamId);
          localStorage.setItem("team_id", newTeamId);
        } else {
          // Check if currentTeamId is still valid (user is still a member)
          const isValidTeam = uniqueTeams.some(team => team.id === currentTeamId);
          if (!isValidTeam) {
            console.log(`TeamContext: Current team ${currentTeamId} is no longer valid, setting to first available team`);
            const newTeamId = uniqueTeams[0].id;
            setCurrentTeamId(newTeamId);
            localStorage.setItem("team_id", newTeamId);
          } else {
            console.log("TeamContext: Current team ID is still valid:", currentTeamId);
          }
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
  const isManager = currentTeam?.role === "admin";

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