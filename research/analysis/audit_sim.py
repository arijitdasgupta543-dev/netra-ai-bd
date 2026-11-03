"""E1: Monte-Carlo evaluation of the random-audit sensitivity estimator (patient level).
Fixed design (0008): stratified Horvitz-Thompson — AI-negatives with a field (low-vision) referral reviewed with p=1,
other AI-negatives through the random audit with p=r. Flawed design (0006): the audit flag is lost when a low-vision
referral upgrades an audit row, so the analyst counts only rows still marked random_audit."""
import json, sys, numpy as np, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
rng = np.random.default_rng(7); REPS = 20000
def sim(N, prev, sens, r, lv_fn, reps=REPS):
    nd = rng.binomial(N, prev, reps); tp = rng.binomial(nd, sens); fn = nd - tp
    lv = rng.binomial(fn, lv_fn); s_nonlv = rng.binomial(fn - lv, r); s_lv = rng.binomial(lv, r)
    fixed = tp / np.maximum(tp + lv + s_nonlv / r, 1)
    flawed = tp / np.maximum(tp + s_nonlv / r, 1)          # low-vision audit rows lost their flag
    return fixed, flawed
out = {"params": {"reps": REPS}, "grid": [], "bias": []}
Ns = [300, 1000, 2000, 5000, 20000]; rates = [0.05, 0.10, 0.20]
for r in rates:
    for N in Ns:
        f, _ = sim(N, 0.30, 0.85, r, 0.5)
        lo, hi = np.percentile(f, [2.5, 97.5])
        out["grid"].append({"r": r, "N": N, "bias": float(f.mean() - 0.85), "halfwidth": float((hi - lo) / 2)})
for prev in [0.15, 0.30]:
    for lvf in [0.25, 0.50, 0.75]:
        f, b = sim(20000, prev, 0.85, 0.05, lvf)
        out["bias"].append({"prev": prev, "lv_fn": lvf, "fixed_bias": float(f.mean() - 0.85), "flawed_bias": float(b.mean() - 0.85)})
json.dump(out, open(sys.argv[1] + "/audit_sim.json", "w"), indent=1)
for g in out["grid"]: print(g)
for b in out["bias"]: print(b)
# Figure: precision vs number of screened patients, one line per audit rate (single y-axis)
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e6e5e1"; COLS = ["#2a78d6", "#eb6834", "#1baf7a"]
fig, ax = plt.subplots(figsize=(6.2, 3.6), dpi=200)
for c, r in zip(COLS, rates):
    pts = [g for g in out["grid"] if g["r"] == r]
    ax.plot([g["N"] for g in pts], [g["halfwidth"] for g in pts], color=c, lw=2, marker="o", ms=4)
    ax.annotate(f"audit {int(r*100)}%", (pts[0]["N"], pts[0]["halfwidth"]), xytext=(-8, 0), textcoords="offset points", ha="right", va="center", fontsize=8, color=INK)
ax.set_xscale("log"); ax.set_xticks(Ns); ax.set_xticklabels([f"{n:,}" for n in Ns])
ax.set_xlabel("Patients screened", color=INK2, fontsize=9); ax.set_ylabel("95% half-width of sensitivity estimate", color=INK2, fontsize=9)
ax.grid(axis="y", color=GRID, lw=0.8); ax.spines[["top", "right"]].set_visible(False)
for s in ["left", "bottom"]: ax.spines[s].set_color(GRID)
ax.tick_params(colors=INK2, labelsize=8); ax.set_xlim(130, 30000); ax.minorticks_off()
ax.set_title("Precision of the field sensitivity estimate (true sensitivity 0.85, prevalence 0.30)", fontsize=9, color=INK, loc="left")
fig.tight_layout(); fig.savefig(sys.argv[1] + "/fig/fig_audit_precision.png"); print("saved")
