import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Smartphone, Stethoscope, Lock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Netra AI – Smartphone cataract screening research" },
      { name: "description", content: "Netra AI collects consented, de-identified eye photos and doctor labels to build a smartphone cataract screening tool for rural Bangladesh." },
      { property: "og:title", content: "Netra AI – Field Data Collector" },
      { property: "og:description", content: "Smartphone cataract screening research for underserved communities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { L } = useLang();
  const { session } = useAuth();
  const points = [
    { icon: Smartphone, en: "Health workers take eye photos with an ordinary smartphone.", bn: "স্বাস্থ্যকর্মীরা সাধারণ স্মার্টফোনে চোখের ছবি তোলেন।" },
    { icon: Stethoscope, en: "Eye doctors label each photo independently, so we can train and test an AI model.", bn: "চক্ষু ডাক্তাররা প্রতিটি ছবি স্বাধীনভাবে মূল্যায়ন করেন, যাতে এআই মডেল প্রশিক্ষণ ও যাচাই করা যায়।" },
    { icon: ShieldCheck, en: "This is screening, not diagnosis. Suspected cases are referred to eye-care professionals.", bn: "এটি স্ক্রিনিং, রোগ নির্ণয় নয়। সন্দেহজনক রোগীদের চক্ষু বিশেষজ্ঞের কাছে পাঠানো হয়।" },
  ];
  const privacy = [
    { en: "Informed consent is recorded before any photo.", bn: "ছবি তোলার আগে সম্মতি নেওয়া হয়।" },
    { en: "No names or phone numbers — only a Study ID (e.g. NETRA-0001).", bn: "নাম বা ফোন নম্বর নেই — শুধু স্টাডি আইডি (যেমন NETRA-0001)।" },
    { en: "Photos stay in private storage, viewable only by approved team members.", bn: "ছবি ব্যক্তিগত স্টোরেজে থাকে, শুধু অনুমোদিত সদস্যরা দেখতে পারেন।" },
  ];
  return (
    <div className="space-y-10">
      <section className="bg-hero -mx-4 -mt-5 px-4 pb-8 pt-8 sm:rounded-b-3xl">
        <div className="grid items-center gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-primary">{L("Cataract screening research · Bangladesh", "ছানি স্ক্রিনিং গবেষণা · বাংলাদেশ")}</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
              {L("Clearer sight for every village", "প্রতিটি গ্রামে পরিষ্কার দৃষ্টি")}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {L(
                "Netra AI is building smartphone-based cataract screening for underserved communities.",
                "নেত্র এআই সুবিধাবঞ্চিত মানুষের জন্য স্মার্টফোন-ভিত্তিক ছানি স্ক্রিনিং তৈরি করছে।",
              )}
            </p>
            <Button asChild size="lg" className="mt-5 h-12 rounded-full px-8 text-base">
              <Link to={session ? "/records" : "/auth"}>{session ? L("Open app", "অ্যাপ খুলুন") : L("Login", "লগইন")}</Link>
            </Button>
          </div>
          <img src={hero} alt="" className="aspect-[16/10] w-full rounded-2xl object-cover shadow-soft" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.en} className="rounded-2xl border bg-card p-5">
            <p.icon className="h-6 w-6 text-primary" />
            <p className="mt-3 text-sm leading-relaxed">{L(p.en, p.bn)}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border bg-primary-soft p-5">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Lock className="h-5 w-5 text-primary" /> {L("How data is protected", "তথ্য কীভাবে সুরক্ষিত")}
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {privacy.map((p) => (
            <li key={p.en} className="flex gap-2"><span className="text-primary">•</span>{L(p.en, p.bn)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
