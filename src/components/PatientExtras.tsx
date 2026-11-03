import { Link } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { useReferralForStudy } from "@/lib/referral-data";
import { districtLabel, maskPhone } from "@/lib/bd";
import { reasonLabel, statusLabel, typeLabel } from "@/lib/referral";
import { Button } from "@/components/ui/button";

/** Contact (if this user may see it), vision results and referral for one patient record. */
export function PatientExtras({ studyId }: { studyId: string }) {
  const { L, T } = useLang();
  const q = useReferralForStudy(studyId);
  if (!q.data) return null;
  const { contact, vision, referral, patient } = q.data;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
      <p className="text-muted-foreground">{L("District", "জেলা")}: {T(districtLabel(patient.district))}</p>
      {contact && <p><b>{contact.full_name}</b> · {maskPhone(contact.phone)}{contact.address ? ` · ${contact.address}` : ""}</p>}
      {vision.length > 0 && <p>{L("Vision", "দৃষ্টি")}: {vision.map((v) => `${v.eye === "right" ? L("R", "ডান") : L("L", "বাম")} ${v.snellen ?? "<6/60"}${v.pinhole_improves ? L(" (pinhole better)", " (পিনহোলে ভালো)") : ""}`).join(" · ")}</p>}
      {referral && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-warning-soft px-2 py-0.5">{T(typeLabel[referral.referral_type])}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5">{T(statusLabel[referral.status])}</span>
          <span className="text-xs text-muted-foreground">{T(reasonLabel[referral.reason])}</span>
          {referral.patient_visible && <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/slip/$studyId" params={{ studyId }}>{L("Referral slip", "রেফারাল স্লিপ")}</Link></Button>}
        </div>
      )}
    </div>
  );
}
