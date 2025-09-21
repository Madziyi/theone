// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Profession =
  | "student"
  | "fisher"
  | "researcher"
  | "utility_manager"
  | "environmental_personnel";

type SignUpArgs = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  profession?: Profession;
};

type SignInArgs = { email: string; password: string };

type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;

  signUp: (args: SignUpArgs) => Promise<void>;
  signIn: (args: SignInArgs) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // This listener is more reliable for handling state changes.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Clean up the subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (args: SignUpArgs) => {
    const { email, password, ...meta } = args;

    // AuthContext.tsx (in your signUp function)
    const redirectUrl = import.meta.env.PROD
      ? "https://telab.apzim.com/auth/callback"
      : "http://localhost:5173/auth/callback";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,         // <— IMPORTANT
        data: meta,
      },
    });

    if (error) throw error;

    // 2) If we already have a session (autoconfirm), upsert full profile now
    const self = data.user;
    if (data.session && self) {
      await supabase.from("profiles").upsert(
        {
          id: self.id,
          email: self.email!,
          first_name: meta.first_name ?? "",
          last_name: meta.last_name ?? "",
          phone_number: meta.phone_number ?? null,
          profession: (meta.profession as any) ?? null,
        },
        { onConflict: "id" }
      );
    }
  };

  const signIn = async ({ email, password }: SignInArgs) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const deleteAccount = async () => {
    if (!user) throw new Error("No user logged in");
    
    // Remove user from all teams
    const { error: teamsError } = await supabase
      .from("team_members")
      .delete()
      .eq("user_id", user.id);
    
    if (teamsError) throw teamsError;
    
    // Delete user profile
    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", user.id);
    
    if (profileError) throw profileError;
    
    // Sign out the user (this will also clear localStorage)
    await signOut();
  };

  const value = useMemo<Ctx>(
    () => ({ user, session, loading, signUp, signIn, signOut, deleteAccount }),
    [user, session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}