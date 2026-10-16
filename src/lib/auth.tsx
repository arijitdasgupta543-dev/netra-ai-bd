import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "health_worker" | "doctor";

type AuthState = {
  session: Session | null;
  userId: string | null;
  role: Role | null;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string | undefined) => {
    if (!uid) {
      setRole(null);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
    setRole((data?.role as Role) ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => {
          void loadRole(s?.user.id);
          router.invalidate();
          if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
        }, 0);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRole(data.session?.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    setRole(null);
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        userId: session?.user.id ?? null,
        role,
        loading,
        refreshRole: () => loadRole(session?.user.id),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const roleLabel: Record<Role, { en: string; bn: string }> = {
  admin: { en: "Admin", bn: "অ্যাডমিন" },
  health_worker: { en: "Health worker", bn: "স্বাস্থ্যকর্মী" },
  doctor: { en: "Doctor", bn: "ডাক্তার" },
};
