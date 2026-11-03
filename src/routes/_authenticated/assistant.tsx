import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, WifiOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { PageTitle, RoleGate } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KB, RED_FLAG_ANSWER, isRedFlag, searchKb } from "@/lib/assistant-kb";
import { askAssistant } from "@/lib/notify.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Assistant – Netra AI" }, { name: "description", content: "Help for health workers." }] }),
  component: () => (
    <RoleGate roles={["admin", "health_worker", "doctor"]}>
      <Assistant />
    </RoleGate>
  ),
});

type Msg = { role: "user" | "assistant"; content: string; source?: "kb" | "ai" | "safety" | "fallback" };

const SUGGEST = ["photo-how", "vision-test", "result-meaning", "referral-slip", "what-cataract", "offline"];

/**
 * Health-worker assistant. Order: (1) red-flag safety answer, (2) offline knowledge base,
 * (3) online AI with a strict system prompt, (4) "ask your supervising doctor".
 */
function Assistant() {
  const { L, lang } = useLang();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const pick = (bn: string, en: string) => (lang === "bn" ? bn : en);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next); setText("");
    if (isRedFlag(question)) { setMsgs([...next, { role: "assistant", content: pick(RED_FLAG_ANSWER.bn, RED_FLAG_ANSWER.en), source: "safety" }]); }
    const kb = searchKb(question);
    if (kb && kb.confidence >= 0.7) { setMsgs((m) => [...m, { role: "assistant", content: pick(kb.entry.bn, kb.entry.en), source: "kb" }]); return; }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setMsgs((m) => [...m, { role: "assistant", content: kb ? pick(kb.entry.bn, kb.entry.en) : L("No internet. Try one of the topics below, or ask your supervising doctor.", "ইন্টারনেট নেই। নিচের বিষয়গুলোর একটি বেছে নিন বা তত্ত্বাবধায়ক ডাক্তারকে জিজ্ঞেস করুন।"), source: kb ? "kb" : "fallback" }]);
      return;
    }
    setBusy(true);
    try {
      const r = await askAssistant({ data: { messages: next.slice(-8).map(({ role, content }) => ({ role, content })) } });
      const answer = r.answer ?? (kb ? pick(kb.entry.bn, kb.entry.en) : L("I am not sure. Please ask your supervising doctor.", "আমি নিশ্চিত নই। তত্ত্বাবধায়ক ডাক্তারকে জিজ্ঞেস করুন।"));
      setMsgs((m) => [...m, { role: "assistant", content: answer, source: r.answer ? "ai" : kb ? "kb" : "fallback" }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: kb ? pick(kb.entry.bn, kb.entry.en) : L("Could not reach the assistant. Ask your supervising doctor.", "সহকারীর সাথে যোগাযোগ হয়নি। তত্ত্বাবধায়ক ডাক্তারকে জিজ্ঞেস করুন।"), source: "fallback" }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <PageTitle sub={L("For health workers. Not for diagnosis.", "স্বাস্থ্যকর্মীদের জন্য। রোগ নির্ণয়ের জন্য নয়।")}>{L("Netra assistant", "নেত্র সহায়ক")}</PageTitle>
      <div className="min-h-[40svh] space-y-3 rounded-2xl border bg-card p-3">
        {msgs.length === 0 && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Bot className="h-5 w-5" />{L("Ask about photos, the vision test, referral or eye care.", "ছবি তোলা, দৃষ্টি পরীক্ষা, রেফারাল বা চোখের যত্ন নিয়ে প্রশ্ন করুন।")}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : m.source === "safety" ? "border border-destructive bg-danger-soft" : "bg-secondary")}>
            {m.content}
            {m.role === "assistant" && m.source && <span className="mt-1 block text-[10px] opacity-60">{{ kb: L("offline guide", "অফলাইন গাইড"), ai: L("AI – check with doctor if unsure", "AI – সন্দেহ হলে ডাক্তারকে জিজ্ঞেস করুন"), safety: L("safety rule", "নিরাপত্তা নিয়ম"), fallback: "" }[m.source]}</span>}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">{L("Thinking…", "ভাবছে…")}</p>}
        <div ref={end} />
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGEST.map((id) => { const e = KB.find((k) => k.id === id); return e ? <button key={id} type="button" className="rounded-full border bg-card px-3 py-1.5 text-xs" onClick={() => void ask(e.keys[0] ?? "")}>{e.keys[0]}</button> : null; })}
      </div>
      <form className="sticky bottom-0 flex gap-2 bg-background py-2" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <Input className="h-12" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={L("Type a question…", "প্রশ্ন লিখুন…")} />
        <Button type="submit" className="h-12" disabled={busy || !text.trim()} aria-label={L("Send", "পাঠান")}><Send /></Button>
      </form>
      {typeof navigator !== "undefined" && !navigator.onLine && <p className="flex items-center gap-1 text-xs text-muted-foreground"><WifiOff className="h-3 w-3" />{L("Offline – answers from the built-in guide.", "অফলাইন – অ্যাপের ভেতরের গাইড থেকে উত্তর।")}</p>}
    </div>
  );
}
