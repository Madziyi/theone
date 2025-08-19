import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function CompleteProfile() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const next = search.get("next") || "/";

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [profession,setProfession]= useState("");
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return navigate("/login", { replace: true });

      // Try to prefill from existing row or metadata
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      setFirstName((prof?.first_name ?? user.user_metadata?.given_name ?? user.user_metadata?.first_name ?? "").toString());
      setLastName((prof?.last_name ?? user.user_metadata?.family_name ?? user.user_metadata?.last_name ?? "").toString());
      setEmail((prof?.email ?? user.email ?? "").toString());
      setPhone(prof?.phone_number ?? "");
      setProfession(prof?.profession ?? "");
    })();
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user) return navigate("/login", { replace: true });

    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        profession,
      },
      { onConflict: "id" }
    );
    setSaving(false);
    navigate(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-4 text-xl font-semibold">Complete your profile</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid gap-1">
          <label className="text-sm">First name</label>
          <input className="h-10 rounded-xl border border-border bg-card px-3" value={firstName} onChange={(e)=>setFirstName(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm">Last name</label>
          <input className="h-10 rounded-xl border border-border bg-card px-3" value={lastName} onChange={(e)=>setLastName(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm">Email</label>
          <input type="email" className="h-10 rounded-xl border border-border bg-card px-3" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <label className="text-sm">Phone number</label>
          <input className="h-10 rounded-xl border border-border bg-card px-3" value={phone} onChange={(e)=>setPhone(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label className="text-sm">Profession</label>
          <input className="h-10 rounded-xl border border-border bg-card px-3" value={profession} onChange={(e)=>setProfession(e.target.value)} />
        </div>
        <div className="pt-2">
          <button disabled={saving} className="h-10 rounded-xl border border-border bg-primary px-4 text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}