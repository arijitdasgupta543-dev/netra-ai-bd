import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { qualityLabel } from "@/lib/labels";

const styles: Record<string, string> = {
  good: "bg-success-soft text-success border-success/30",
  fair: "bg-warning-soft text-foreground border-warning/40",
  poor: "bg-danger-soft text-destructive border-destructive/30",
};

export function QualityBadge({ status }: { status: string | null }) {
  const { L } = useLang();
  if (!status) return <span className="text-xs text-muted-foreground">–</span>;
  const lbl = qualityLabel[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", styles[status])}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {lbl ? L(lbl.en, lbl.bn) : status}
    </span>
  );
}
