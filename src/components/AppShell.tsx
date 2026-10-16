import { Link, useRouterState } from "@tanstack/react-router";
import { Eye, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { useAuth, roleLabel, type Role } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { to: string; en: string; bn: string; roles: Role[] };

const NAV: NavItem[] = [
  { to: "/screening", en: "New screening", bn: "নতুন স্ক্রিনিং", roles: ["admin", "health_worker"] },
  { to: "/review", en: "Doctor review", bn: "ডাক্তারের মূল্যায়ন", roles: ["admin", "doctor"] },
  { to: "/records", en: "Records", bn: "রেকর্ড", roles: ["admin", "health_worker", "doctor"] },
  { to: "/dashboard", en: "Dashboard", bn: "ড্যাশবোর্ড", roles: ["admin", "health_worker", "doctor"] },
  { to: "/demo", en: "AI demo", bn: "এআই ডেমো", roles: ["admin", "health_worker", "doctor"] },
  { to: "/export", en: "Export", bn: "এক্সপোর্ট", roles: ["admin"] },
  { to: "/users", en: "Users & sites", bn: "ব্যবহারকারী ও সাইট", roles: ["admin"] },
];

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex rounded-full border bg-card p-0.5 text-sm" role="group" aria-label="Language">
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            "min-h-9 rounded-full px-3 font-medium transition-colors",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {l === "bn" ? "বাংলা" : "EN"}
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { L, T } = useLang();
  const { session, role, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = NAV.filter((n) => role && n.roles.includes(role));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Eye className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold">Netra AI</span>
              <span className="block text-[11px] text-muted-foreground">{L("Field Data Collector", "মাঠ তথ্য সংগ্রহ")}</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            {session && (
              <button
                onClick={signOut}
                className="grid h-10 w-10 place-items-center rounded-full border text-muted-foreground"
                aria-label={L("Sign out", "লগ আউট")}
                title={L("Sign out", "লগ আউট")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <nav className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-4 pb-2.5">
            {items.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  path.startsWith(n.to) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                )}
              >
                {L(n.en, n.bn)}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {session && role && (
        <div className="mx-auto max-w-5xl px-4 pt-3 text-xs text-muted-foreground">
          {session.user.email} · {T(roleLabel[role])}
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { L, T } = useLang();
  const { role, loading } = useAuth();
  if (loading) return <p className="text-muted-foreground">{L("Loading…", "লোড হচ্ছে…")}</p>;
  if (!role)
    return (
      <div className="rounded-xl border bg-warning-soft p-5">
        <p className="font-semibold">{L("Waiting for role assignment", "ভূমিকা নির্ধারণের অপেক্ষায়")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {L(
            "Your account is created. Ask the admin to give you a role (health worker or doctor).",
            "আপনার অ্যাকাউন্ট তৈরি হয়েছে। অ্যাডমিনকে আপনার ভূমিকা (স্বাস্থ্যকর্মী বা ডাক্তার) দিতে বলুন।",
          )}
        </p>
      </div>
    );
  if (!roles.includes(role))
    return <p className="text-muted-foreground">{L("You don't have access to this page.", "এই পাতায় আপনার প্রবেশাধিকার নেই।")}</p>;
  return <>{children}</>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-semibold sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
