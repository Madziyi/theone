// src/hooks/useProfile.ts
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type Profile = {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  profession: null | "student" | "fisher" | "researcher" | "utility_manager" | "environmental_personnel";
};

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile((data as any) ?? null);
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async (patch: Partial<Profile>) => {
    if (!user) throw new Error("Not signed in");
    const { error, data } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select()
      .single();
    if (error) throw error;
    setProfile(data as any);
  };

  return { profile, loading, save };
}
