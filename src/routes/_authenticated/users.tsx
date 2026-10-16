import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth, roleLabel, type Role } from "@/lib/auth";
import { useSites } from "@/lib/data";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users & sites – Netra AI" }, { name: "description", content: "Manage team roles and screening sites." }] }),
  component: () => (
    <RoleGate roles={["admin"]}>
      <UsersPage />
    </RoleGate>
  ),
});

function UsersPage() {
  const { L } = useLang();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return profiles.map((p) => ({ ...p, role: (roles?.find((r) => r.user_id === p.id)?.role ?? "none") as Role | "none" }));
    },
  });

  const setRole = async (uid: string, role: Role | "none") => {
    const { error } =
      role === "none"
        ? await supabase.from("user_roles").delete().eq("user_id", uid)
        : await supabase.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id" });
    if (error) return toast.error(error.message);
    toast.success(L("Role updated", "ভূমিকা হালনাগাদ হয়েছে"));
    qc.invalidateQueries({ queryKey: ["users-admin"] });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <PageTitle>{L("Users", "ব্যবহারকারী")}</PageTitle>
        <div className="space-y-2">
          {users.data?.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.full_name || "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <Select value={u.role} onValueChange={(v) => setRole(u.id, v as Role | "none")} disabled={u.id === userId}>
                <SelectTrigger className="h-11 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{L("No access", "প্রবেশাধিকার নেই")}</SelectItem>
                  {(Object.keys(roleLabel) as Role[]).map((r) => (
                    <SelectItem key={r} value={r}>{L(roleLabel[r].en, roleLabel[r].bn)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </section>
      <Sites />
    </div>
  );
}

function Sites() {
  const { L } = useLang();
  const qc = useQueryClient();
  const sites = useSites();
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("sites").insert({ name: name.trim() });
    if (error) return toast.error(error.message);
    setName("");
    qc.invalidateQueries({ queryKey: ["sites"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("sites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sites"] });
  };
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold">{L("Screening sites", "স্ক্রিনিং স্থান")}</h2>
      <div className="space-y-2">
        {sites.data?.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl border bg-card p-3">
            <span>{s.name}</span>
            <Button variant="ghost" size="icon" onClick={() => remove(s.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input className="h-12" placeholder={L("New site name", "নতুন স্থানের নাম")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button className="h-12" onClick={add}>{L("Add", "যোগ")}</Button>
      </div>
    </section>
  );
}
