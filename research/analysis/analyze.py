"""Collect all experiment results for the paper: architecture table, ablations, ROC figure, workload, robustness."""
import json, glob, os, sys, numpy as np, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy import stats
from sklearn.metrics import roc_curve
S = sys.argv[1]; CV = f"{S}/ml/cv5"; P = f"{S}/p1rev"; OUT = {}

def wilson(k, n, z=1.96):
    if n == 0: return (float("nan"),) * 3
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, max(0, c - h), min(1, c + h)

def _midrank(x):
    J = np.argsort(x); Z = x[J]; N = len(x); T = np.zeros(N); i = 0
    while i < N:
        j = i
        while j < N and Z[j] == Z[i]: j += 1
        T[i:j] = 0.5 * (i + j - 1) + 1; i = j
    out = np.empty(N); out[J] = T; return out

def delong(y, preds):
    """Fast DeLong (Sun & Xu 2014). preds: list of score arrays. Returns aucs, covariance."""
    y = np.asarray(y).astype(int); pos, neg = preds[0][y == 1], None
    m, n = (y == 1).sum(), (y == 0).sum(); k = len(preds)
    tx = np.empty((k, m)); ty = np.empty((k, n)); tz = np.empty((k, m + n))
    for r, p in enumerate(preds):
        p = np.asarray(p); X, Y = p[y == 1], p[y == 0]
        tx[r] = _midrank(X); ty[r] = _midrank(Y); tz[r] = _midrank(np.concatenate([X, Y]))
    aucs = tz[:, :m].sum(1) / m / n - (m + 1.0) / 2.0 / n
    v01 = (tz[:, :m] - tx) / n; v10 = 1.0 - (tz[:, m:] - ty) / m
    cov = np.atleast_2d(np.cov(v01)) / m + np.atleast_2d(np.cov(v10)) / n
    return aucs, cov

def auc_ci(y, p):
    a, c = delong(y, [p]); se = np.sqrt(c[0, 0]); return float(a[0]), float(a[0] - 1.96 * se), float(a[0] + 1.96 * se)

def paired(y, p1, p2):
    a, c = delong(y, [p1, p2]); d = a[0] - a[1]; se = np.sqrt(c[0, 0] + c[1, 1] - 2 * c[0, 1])
    return float(d), float(d - 1.96 * se), float(d + 1.96 * se), float(2 * stats.norm.sf(abs(d) / se))

def load(arm, rep):
    fs = sorted(glob.glob(f"{CV}/{arm}_r{rep}_f*.json"))
    if len(fs) < 5: return None
    F = [json.load(open(f)) for f in fs]; n = sum(len(f["test_idx"]) for f in F)
    oof = np.full(n, np.nan); y = np.full(n, np.nan); band = {"youden": np.zeros(n, bool), "s95": np.zeros(n, bool)}
    for f in F:
        idx = np.array(f["test_idx"]); p = np.array(f["p_test"]); oof[idx] = p; y[idx] = f["y_test"]
        band["youden"][idx] = p >= f["thr_youden"]; band["s95"][idx] = p >= f["thr_s95"]
    return {"p": oof, "y": y.astype(int), "pos": band, "params": F[0]["params"], "secs": float(np.mean([f["secs"] for f in F])),
            "thr_s95": [f["thr_s95"] for f in F], "thr_youden": [f["thr_youden"] for f in F]}

def ss(y, pos):
    tp = int((pos & (y == 1)).sum()); fn = int((~pos & (y == 1)).sum()); tn = int((~pos & (y == 0)).sum()); fp = int((pos & (y == 0)).sum())
    return wilson(tp, tp + fn), wilson(tn, tn + fp)

fmt3 = lambda t: f"{t[0]:.3f} ({t[1]:.3f}–{t[2]:.3f})"
fmtp = lambda t: f"{t[0]*100:.0f}% ({t[1]*100:.0f}–{t[2]*100:.0f})"
NAMES = {"mnv2": "MobileNetV2", "densenet121": "DenseNet121", "resnet50": "ResNet50", "vgg16": "VGG16"}
SIZE = {"mnv2": 14, "densenet121": 33, "resnet50": 94, "vgg16": 59}  # float32 MB (backbone, notop) for reference
rows = []; arch = {}
for bb in NAMES:
    r = load(f"crop_{bb}", 0)
    if r is None: continue
    arch[bb] = r; a = auc_ci(r["y"], r["p"]); sy, py = ss(r["y"], r["pos"]["youden"]); s9, p9 = ss(r["y"], r["pos"]["s95"])
    acc = float(((r["p"] >= 0.5) == (r["y"] == 1)).mean())
    rows.append(f"| {NAMES[bb]} | {r['params']/1e6:.1f} M | {fmt3(a)} | {fmtp(sy)} | {fmtp(py)} | {fmtp(s9)} | {fmtp(p9)} | {acc*100:.1f}% | {r['secs']:.0f} s |")
    OUT[f"arch_{bb}"] = {"auc": a, "youden": [sy, py], "s95": [s9, p9], "acc05": acc, "params": r["params"], "secs": r["secs"]}
OUT["TABLE_ARCH"] = "| Architecture | Parameters | AUC (95% CI) | Sens (Youden) | Spec (Youden) | Sens (≥0.95 rule) | Spec (≥0.95 rule) | Accuracy at 0.5 | Train time/fold |\n|---|---|---|---|---|---|---|---|---|\n" + "\n".join(rows)
# pairwise vs MobileNetV2
if "mnv2" in arch:
    OUT["arch_vs_mnv2"] = {bb: paired(arch["mnv2"]["y"], arch[bb]["p"], arch["mnv2"]["p"]) for bb in arch if bb != "mnv2"}
# ROC figure
if arch:
    COLS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]; fig, ax = plt.subplots(figsize=(4.6, 4.4), dpi=200)
    for c, (bb, r) in zip(COLS, arch.items()):
        f, t, _ = roc_curve(r["y"], r["p"]); ax.plot(f, t, color=c, lw=2, label=f"{NAMES[bb]} (AUC {OUT[f'arch_{bb}']['auc'][0]:.3f})")
    ax.plot([0, 1], [0, 1], color="#bdbcb8", lw=1, ls="--"); ax.set_xlabel("1 − specificity", fontsize=9, color="#52514e"); ax.set_ylabel("Sensitivity", fontsize=9, color="#52514e")
    ax.legend(fontsize=7.5, frameon=False, loc="lower right"); ax.spines[["top", "right"]].set_visible(False); ax.tick_params(labelsize=8, colors="#52514e")
    ax.grid(color="#e6e5e1", lw=0.8); fig.tight_layout(); fig.savefig(f"{P}/fig/fig_roc_arch.png")
# ablations
abl = []
def addabl(label, a1, a2, rep=0):
    r1, r2 = load(a1, rep), load(a2, rep)
    if r1 is None or r2 is None: return
    assert (r1["y"] == r2["y"]).all()
    A1, A2 = auc_ci(r1["y"], r1["p"]), auc_ci(r2["y"], r2["p"]); d = paired(r1["y"], r1["p"], r2["p"])
    abl.append(f"| {label} | {fmt3(A1)} | {fmt3(A2)} | {d[0]:+.3f} ({d[1]:+.3f} to {d[2]:+.3f}) | {d[3]:.2f} |"); OUT[f"abl_{a1}_{a2}_r{rep}"] = {"a1": A1, "a2": A2, "diff": d}
addabl("Input: pupil crop (A) vs full image (B), repeat 1", "crop_mnv2", "full_mnv2", 0)
addabl("Input: pupil crop (A) vs full image (B), repeat 2", "crop_mnv2", "full_mnv2", 1)
addabl("Initialisation: V1 in-house (A) vs ImageNet (B), crop", "crop_v1", "crop_mnv2", 0)
OUT["TABLE_ABL"] = "| Comparison | AUC A (95% CI) | AUC B (95% CI) | Difference A − B (95% CI) | p (DeLong) |\n|---|---|---|---|---|\n" + "\n".join(abl)
# workload by operating point (MobileNetV2 crop, out-of-fold, eye level); 40,000 eyes/day at 1,000 workers
if "mnv2" in arch:
    r = arch["mnv2"]; y = r["y"]; p = r["p"]
    ops = [("Refer only (score ≥ 0.5)", p >= 0.5), ("Two-tier: refer ≥ 0.5, review ≥ Youden threshold", (p >= 0.5) | r["pos"]["youden"]),
           ("Two-tier: refer ≥ 0.5, review ≥ sensitivity-0.95 threshold", (p >= 0.5) | r["pos"]["s95"])]
    W = []
    for name, pos in ops:
        se = (pos & (y == 1)).sum() / (y == 1).sum(); sp = (~pos & (y == 0)).sum() / (y == 0).sum()
        for prev in (0.10, 0.20, 0.30):
            eyes = 40000; flag = prev * se + (1 - prev) * (1 - sp); aud = 0.10 * (1 - flag) * eyes; tot = flag * eyes + aud
            W.append({"op": name, "prev": prev, "sens": float(se), "spec": float(sp), "flag_rate": float(flag), "reviews": float(tot), "hours": float(tot * 30 / 3600), "missed": float(eyes * prev * (1 - se))})
    OUT["workload"] = W
    OUT["TABLE_WORK"] = "| Operating point | Sensitivity | Specificity | Eyes flagged | Doctor reviews/day (incl. 10% audit) | Doctor-hours/day (30 s) | Cataract eyes missed/day |\n|---|---|---|---|---|---|---|\n" + "\n".join(
        f"| {w['op']} | {w['sens']*100:.0f}% | {w['spec']*100:.0f}% | {w['flag_rate']*100:.0f}% | {w['reviews']:,.0f} | {w['hours']:.0f} | {w['missed']:,.0f} |" for w in W if w["prev"] == 0.20)
# clean final model
fc = f"{S}/ml/clean5/results_clean.json"
if os.path.exists(fc):
    R = json.load(open(fc)); OUT["clean"] = {k: R[k] for k in ("crop", "full") }
    for k in ("crop", "full"):
        yt, pt = np.array(R[k]["y_test"]), np.array(R[k]["p_test"])
        OUT["clean"][k]["test_auc_ci"] = auc_ci(yt, pt)
        for nm in ("thr_youden", "thr_s95"):
            OUT["clean"][k][nm + "_ss"] = ss(yt, pt >= R[k][nm])
        OUT["clean"][k]["ss05"] = ss(yt, pt >= 0.5)
    OUT["clean"]["auc_diff"] = R["auc_diff_crop_minus_full"]; OUT["clean"]["tflite"] = {k: R["tflite"][k] for k in ("size_mb", "max_abs_diff")}
    kp = np.array(R["keras_p_test"]); tl = np.array(R["tflite"]["p"])
    OUT["clean"]["tflite_same"] = {nm: int(((kp >= t) == (tl >= t)).sum()) for nm, t in (("0.5", 0.5), ("s95", R["crop"]["thr_s95"]))}
    rob = R["robustness_crop"]; COLS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"]
    fig, ax = plt.subplots(figsize=(5.6, 3.6), dpi=200)
    for c, (kind, v) in zip(COLS, rob.items()):
        ax.plot([x["severity"] for x in v], [x["auc"] for x in v], color=c, lw=2, marker="o", ms=3.5, label=kind)
    ax.set_xlabel("Severity of simulated problem (0 = none)", fontsize=9, color="#52514e"); ax.set_ylabel("Test AUC", fontsize=9, color="#52514e")
    ax.set_ylim(0.5, 1.0); ax.grid(axis="y", color="#e6e5e1"); ax.spines[["top", "right"]].set_visible(False); ax.tick_params(labelsize=8, colors="#52514e")
    ax.legend(fontsize=7.5, frameon=False, ncol=3, loc="lower left"); fig.tight_layout(); fig.savefig(f"{P}/fig/fig_robustness.png")
    OUT["clean"]["robust_min"] = {k: min(x["auc"] for x in v) for k, v in rob.items()}
json.dump(OUT, open(f"{P}/results_paper.json", "w"), indent=1, default=float)
print(json.dumps({k: v for k, v in OUT.items() if not k.startswith("TABLE")}, indent=1, default=float)[:6000])
for k in ("TABLE_ARCH", "TABLE_ABL", "TABLE_WORK"):
    print(OUT.get(k, ""))
