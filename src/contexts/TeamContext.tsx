// src/contexts/TeamContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Team = { id: string; name: string; logo_url: string | null; role: "admin" | "member"; is_operations?: boolean };
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
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Initialize team from localStorage on mount
  useEffect(() => {
    const storedTeamId = localStorage.getItem("team_id");
    console.log("TeamContext: Initial team ID from localStorage:", storedTeamId);
    if (storedTeamId) {
      setCurrentTeamId(storedTeamId);
    }
  }, []);

  // Listen for authentication state changes
  useEffect(() => {
    console.log("TeamContext: Setting up auth listener...");
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("TeamContext: Auth state changed, event:", event, "user:", session?.user?.email ?? "none");
      
      // Clear team data only on explicit logout
      if (event === 'SIGNED_OUT') {
        console.log("TeamContext: User signed out, clearing team data");
        setTeams([]);
        setCurrentTeamId(null);
        localStorage.removeItem("team_id");
      }
      
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch teams when user changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      console.log("TeamContext: Starting to fetch team data for user:", currentUser?.email ?? "none");
      setLoading(true);
      
      if (!currentUser) {
        console.log("TeamContext: No user found, setting empty teams");
        if (!cancelled) {
          setTeams([]);
          // Don't clear currentTeamId or localStorage here - user might be loading
          // Only clear if we're certain there's no authenticated user
          setLoading(false);
        }
        return;
      }
      
      const { data, error } = await supabase
        .from("team_members")
        .select("role, teams:team_id ( id, name, logo_url, is_operations )")
        .eq("user_id", currentUser.id)
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
            is_operations: r.teams?.is_operations ?? false,
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
        } else {
          // Check what team should be active
          const storedTeamId = localStorage.getItem("team_id");
          const teamToCheck = currentTeamId || storedTeamId;
          
          console.log("TeamContext: Stored team ID from localStorage:", storedTeamId);
          console.log("TeamContext: Current state team ID:", currentTeamId);
          console.log("TeamContext: Team to check:", teamToCheck);
          
          if (teamToCheck) {
            // Check if the team (from state or storage) is still valid
            const isValidTeam = uniqueTeams.some(team => team.id === teamToCheck);
            if (isValidTeam) {
              console.log("TeamContext: Team is valid, using:", teamToCheck);
              // Ensure localStorage and state are in sync
              if (currentTeamId !== teamToCheck) {
                setCurrentTeamId(teamToCheck);
              }
              if (storedTeamId !== teamToCheck) {
                localStorage.setItem("team_id", teamToCheck);
              }
            } else {
              console.log(`TeamContext: Team ${teamToCheck} is no longer valid, setting to first available team`);
              const newTeamId = uniqueTeams[0].id;
              setCurrentTeamId(newTeamId);
              localStorage.setItem("team_id", newTeamId);
            }
          } else {
            // No team in state or storage, use first available team
            const newTeamId = uniqueTeams[0].id;
            console.log(`TeamContext: No team found anywhere, setting to first team: ${newTeamId}`);
            setCurrentTeamId(newTeamId);
            localStorage.setItem("team_id", newTeamId);
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
  }, [currentUser]);

  const currentTeam = useMemo(() => teams.find(t => t.id === currentTeamId) ?? null, [teams, currentTeamId]);
  const isManager = currentTeam?.role === "admin";

  const setTeam = (id: string) => {
    console.log("TeamContext: setTeam called with ID:", id);
    console.log("TeamContext: Before setTeam - current state ID:", currentTeamId);
    console.log("TeamContext: Before setTeam - localStorage ID:", localStorage.getItem("team_id"));
    setCurrentTeamId(id);
    localStorage.setItem("team_id", id);
    console.log("TeamContext: After setTeam - localStorage ID:", localStorage.getItem("team_id"));
  };

  const value: Ctx = { teams, currentTeamId, currentTeam, setTeam, isManager, loading };
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within TeamProvider");
  return ctx;
}