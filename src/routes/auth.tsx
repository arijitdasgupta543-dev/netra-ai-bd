import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Login – Netra AI" },
      { name: "description", content: "Sign in to the Netra AI field data collector." },
      { property: "og:title", content: "Login – Netra AI" },
      { property: "og:description", content: "Sign in to the Netra AI field data collector." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { L } = useLang();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/records" });
  }, [session, navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) setSent(true);
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-5 text-2xl font-semibold">{L("Team login", "টিম লগইন")}</h1>
      {sent ? (
        <div className="rounded-xl border bg-success-soft p-5 text-sm">
          {L("Check your email and click the confirmation link, then log in.", "আপনার ইমেইল দেখুন ও নিশ্চিতকরণ লিংকে ক্লিক করুন, তারপর লগইন করুন।")}
        </div>
      ) : (
        <Tabs defaultValue="in">
          <TabsList className="grid h-12 w-full grid-cols-2">
            <TabsTrigger value="in" className="h-10">{L("Login", "লগইন")}</TabsTrigger>
            <TabsTrigger value="up" className="h-10">{L("Sign up", "নিবন্ধন")}</TabsTrigger>
          </TabsList>
          <TabsContent value="in">
            <form onSubmit={signIn} className="space-y-4 pt-3">
              <Field label={L("Email", "ইমেইল")}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></Field>
              <Field label={L("Password", "পাসওয়ার্ড")}><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></Field>
              <Button disabled={busy} className="h-12 w-full text-base">{L("Login", "লগইন")}</Button>
            </form>
          </TabsContent>
          <TabsContent value="up">
            <form onSubmit={signUp} className="space-y-4 pt-3">
              <Field label={L("Your name (staff)", "আপনার নাম (কর্মী)")}><Input required value={name} onChange={(e) => setName(e.target.value)} className="h-12" /></Field>
              <Field label={L("Email", "ইমেইল")}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></Field>
              <Field label={L("Password (min 6)", "পাসওয়ার্ড (কমপক্ষে ৬)")}><Input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></Field>
              <Button disabled={busy} className="h-12 w-full text-base">{L("Create account", "অ্যাকাউন্ট তৈরি")}</Button>
              <p className="text-xs text-muted-foreground">{L("The admin must assign your role before you can see data.", "তথ্য দেখার আগে অ্যাডমিনকে আপনার ভূমিকা নির্ধারণ করতে হবে।")}</p>
            </form>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
