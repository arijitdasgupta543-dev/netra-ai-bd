import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { LangProvider } from "@/lib/i18n";
import { VisionTest, type VisionResults } from "./VisionTest";
import { routeTree } from "@/routeTree.gen";

function Harness({ onResult }: { onResult: (v: VisionResults) => void }) {
  const [v, setV] = useState<VisionResults>({});
  return <VisionTest value={v} onChange={(n) => { setV(n); onResult(n); }} />;
}

describe("VisionTest", () => {
  it("calibrates, runs the E test and records 'worse than 6/60' when nothing is seen", () => {
    localStorage.removeItem("netra-px-per-mm");
    let last: VisionResults = {};
    render(<LangProvider><Harness onResult={(v) => (last = v)} /></LangProvider>);
    fireEvent.click(screen.getByText("দাগ কার্ডের সমান হয়েছে"));
    expect(Number(localStorage.getItem("netra-px-per-mm"))).toBeGreaterThan(1);
    fireEvent.click(screen.getByText("E পরীক্ষা শুরু"));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText("দেখছেন না"));
    expect(last.right?.logmar).toBeNull();
    expect(screen.getByText(/6\/60-এর চেয়ে খারাপ/)).toBeInTheDocument();
    expect(screen.getByText(/পিনহোল/)).toBeInTheDocument();
  });
});

describe("New routes", () => {
  it.each(["/referrals", "/slip/NETRA-0001", "/assistant", "/learn", "/settings"])("matches %s", (path) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes(path).at(-1)?.routeId).toContain(path.split("/")[1]);
  });
});
