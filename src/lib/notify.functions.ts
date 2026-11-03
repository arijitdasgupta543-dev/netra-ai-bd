import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { smsText, type Hospital, type ReferralType } from "./referral";
import { ASSISTANT_SYSTEM_PROMPT } from "./assistant-kb";

/**
 * Server-only actions. Secrets (SMS gateway key, AI key) never reach the phone.
 * SMS gateway: any Bangladeshi bulk-SMS provider with an HTTP API (e.g. BulkSMSBD style:
 * POST api_key, senderid, number, message). Configure SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID.
 * Without them the call returns "not_configured" and the app falls back to WhatsApp / showing the slip.
 */
async function sendSms(phone: string, message: string): Promise<{ status: "sent" | "failed" | "not_configured"; response: string }> {
  const url = process.env["SMS_API_URL"], key = process.env["SMS_API_KEY"], sender = process.env["SMS_SENDER_ID"];
  if (!url || !key || !sender) return { status: "not_configured", response: "" };
  try {
    const body = new URLSearchParams({ api_key: key, senderid: sender, number: phone.replace(/^\+/, ""), message, type: "text" });
    const res = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    const text = (await res.text()).slice(0, 300);
    return { status: res.ok ? "sent" : "failed", response: text };
  } catch (e) {
    return { status: "failed", response: String((e as Error).message).slice(0, 300) };
  }
}

type AuthedClient = import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
async function roleOf(supabase: AuthedClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role ?? null;
}

/** Alert opted-in doctors about a new urgent referral. Idempotent per (referral, doctor). */
export const notifyDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ patientId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    // The caller must be able to see the referral under RLS (i.e. it is a real, visible referral).
    const visible = await context.supabase.from("referrals").select("id, priority, status, patients(study_id)").eq("patient_id", data.patientId).maybeSingle();
    if (visible.error || !visible.data) return { sent: 0, status: "no_referral" as const };
    const ref = visible.data as unknown as { id: string; priority: string; status: string; patients: { study_id: string } | null };
    if (ref.priority !== "urgent" || ref.status !== "awaiting_doctor") return { sent: 0, status: "not_urgent" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roles = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "doctor");
    const ids = (roles.data ?? []).map((r) => r.user_id);
    const profs = ids.length ? await supabaseAdmin.from("profiles").select("id, phone, notify_sms").in("id", ids).eq("notify_sms", true).not("phone", "is", null) : { data: [] };
    let sent = 0, last: string = "not_configured";
    for (const d of (profs.data ?? []) as { id: string; phone: string | null }[]) {
      if (!d.phone) continue;
      const already = await supabaseAdmin.from("sms_log").select("id").eq("referral_id", ref.id).eq("recipient", "doctor").eq("recipient_user", d.id).maybeSingle();
      if (already.data) continue;
      const r = await sendSms(d.phone, `নেত্র AI: নতুন জরুরি রেফারাল ${ref.patients?.study_id ?? ""}। অ্যাপের "ডাক্তারের মূল্যায়ন" পাতায় দেখুন।`);
      await supabaseAdmin.from("sms_log").insert({ referral_id: ref.id, recipient: "doctor", recipient_user: d.id, phone_last4: d.phone.slice(-4), status: r.status, provider_response: r.response });
      last = r.status; if (r.status === "sent") sent++;
    }
    return { sent, status: last };
  });

/** Send the referral slip to the patient by SMS. Only staff who can see the referral and the contact may do this. */
export const smsPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ patientId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase, context.userId);
    if (!role) throw new Error("not allowed");
    const ref = await context.supabase.from("referrals").select("id, referral_type, patient_visible, hospitals(*), patients(study_id)").eq("patient_id", data.patientId).maybeSingle();
    const contact = await context.supabase.from("patient_contacts").select("phone").eq("patient_id", data.patientId).maybeSingle();
    if (ref.error || !ref.data) throw new Error("referral not found");
    const r = ref.data as unknown as { id: string; referral_type: ReferralType; patient_visible: boolean; hospitals: Hospital | null; patients: { study_id: string } | null };
    if (!r.patient_visible) throw new Error("not yet confirmed by a doctor");
    const phone = (contact.data as { phone: string | null } | null)?.phone;
    if (!phone) return { status: "no_phone" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await sendSms(phone, smsText({ studyId: r.patients?.study_id ?? "", type: r.referral_type, hospital: r.hospitals }));
    await supabaseAdmin.from("sms_log").upsert({ referral_id: r.id, recipient: "patient", recipient_user: null, phone_last4: phone.slice(-4), status: res.status, provider_response: res.response }, { onConflict: "referral_id,recipient,recipient_user" });
    if (res.status === "sent") await context.supabase.from("referrals").update({ status: "patient_informed" }).eq("id", r.id).in("status", ["awaiting_doctor", "confirmed"]);
    return { status: res.status };
  });

/**
 * Online fallback for the assistant (the offline knowledge base answers first on the phone).
 * Uses an OpenAI-compatible chat endpoint: Lovable AI gateway by default (LOVABLE_API_KEY),
 * or ASSISTANT_API_URL / ASSISTANT_API_KEY / ASSISTANT_MODEL.
 */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1500) })).min(1).max(12) }))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase, context.userId);
    if (!role) throw new Error("not allowed");
    const url = process.env["ASSISTANT_API_URL"] ?? "https://ai.gateway.lovable.dev/v1/chat/completions";
    const key = process.env["ASSISTANT_API_KEY"] ?? process.env["LOVABLE_API_KEY"];
    const model = process.env["ASSISTANT_MODEL"] ?? "google/gemini-2.5-flash";
    if (!key) return { answer: null as string | null, status: "not_configured" as const };
    // strip anything that looks like a BD phone number before it leaves our server
    const clean = data.messages.map((m) => ({ ...m, content: m.content.replace(/(?:\+?88)?01[3-9]\d{8}/g, "[ফোন]") }));
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 400, messages: [{ role: "system", content: ASSISTANT_SYSTEM_PROMPT }, ...clean] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { answer: null, status: "error" as const };
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { answer: j.choices?.[0]?.message?.content?.trim() ?? null, status: "ok" as const };
  });
