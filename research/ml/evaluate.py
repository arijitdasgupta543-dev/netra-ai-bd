"""Evaluate v1 (original), v1r (full image, same recipe) and v3 (pupil crop) on the same 34-image test set;
shortcut check, Grad-CAM, robustness to simulated capture problems, and TFLite export check."""
import json, sys, numpy as np, cv2, tensorflow as tf, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import roc_auc_score
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_predict
S = sys.argv[1]; OUT = f"{S}/ml/out"; R = {}

def wilson(k, n, z=1.96):
    if n == 0: return (float("nan"),) * 3
    p = k / n; d = 1 + z*z/n; c = (p + z*z/(2*n)) / d; h = z * np.sqrt(p*(1-p)/n + z*z/(4*n*n)) / d
    return p, max(0, c-h), min(1, c+h)

def metrics(y, p, thr):
    yp = p >= thr; tp = int(((yp == 1) & (y == 1)).sum()); tn = int(((yp == 0) & (y == 0)).sum())
    fp = int(((yp == 1) & (y == 0)).sum()); fn = int(((yp == 0) & (y == 1)).sum())
    return {"threshold": float(thr), "auc": float(roc_auc_score(y, p)), "tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "sensitivity": wilson(tp, tp+fn), "specificity": wilson(tn, tn+fp), "ppv": wilson(tp, tp+fp), "npv": wilson(tn, tn+fn), "accuracy": wilson(tp+tn, len(y))}

def pick_threshold(y, p, target=0.95):
    # highest threshold that keeps validation sensitivity ≥ target (screening: do not miss cataract)
    best = 0.5
    for t in sorted(set(p.tolist()), reverse=True):
        if ((p >= t) & (y == 1)).sum() / max(1, (y == 1).sum()) >= target: best = t; break
    return float(best)

def bootstrap_auc_diff(y, a, b, n=2000, seed=0):
    rng = np.random.default_rng(seed); d = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if len(set(y[i])) < 2: continue
        d.append(roc_auc_score(y[i], a[i]) - roc_auc_score(y[i], b[i]))
    d = np.array(d); return float(d.mean()), float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))

preds = {t: json.load(open(f"{OUT}/pred_{t}.json")) for t in ("v1_original", "v1r_full", "v3_crop")}
for t, d in preds.items():
    y, p, sp = np.array(d["y"]), np.array(d["p"]), np.array(d["split"])
    thr = pick_threshold(y[sp == "val"], p[sp == "val"])
    R[t] = {"val_auc": float(roc_auc_score(y[sp == "val"], p[sp == "val"])), "test": metrics(y[sp == "test"], p[sp == "test"], thr)}
yt = np.array(preds["v3_crop"]["y"])[np.array(preds["v3_crop"]["split"]) == "test"]
pt = {t: np.array(d["p"])[np.array(d["split"]) == "test"] for t, d in preds.items()}
R["auc_diff_v3_minus_v1r_test"] = bootstrap_auc_diff(yt, pt["v3_crop"], pt["v1r_full"])

# shortcut check: can simple image statistics (size, mean colour) of the *model input* predict the label?
def shortcut(mode):
    z = np.load(f"{OUT}/data_{mode}.npz"); X = z["X"].astype(np.float32); y = z["y"]
    C = json.load(open(f"{S}/ml/circles_final.json")); keys = list(z["keys"])
    feats = [[X[i][..., c].mean() for c in range(3)] + [X[i][..., c].std() for c in range(3)] for i in range(len(X))]
    if mode == "full": feats = [f + [np.log(C[k]["w"]), np.log(C[k]["h"])] for f, k in zip(feats, keys)]
    p = cross_val_predict(LogisticRegression(max_iter=2000), np.array(feats), y, cv=5, method="predict_proba")[:, 1]
    return float(roc_auc_score(y, p))
R["shortcut_auc"] = {"full_image_size_colour": shortcut("full"), "pupil_crop_colour": shortcut("crop")}

# Grad-CAM: share of heat inside the iris circle (crop) — objective "is it looking at the eye?"
def gradcam(model, x):
    last = [l for l in model.layers if isinstance(l, tf.keras.layers.Conv2D) or "Conv_1" in l.name][-1]
    g = tf.keras.Model(model.inputs, [model.get_layer("out_relu").output if "out_relu" in [l.name for l in model.layers] else last.output, model.output])
    with tf.GradientTape() as tape:
        a, o = g(x[None], training=False); s = o[:, 0]
    gr = tape.gradient(s, a)[0]; w = tf.reduce_mean(gr, axis=(0, 1)); cam = tf.nn.relu(tf.reduce_sum(a[0] * w, -1)).numpy()
    cam = cv2.resize(cam, (224, 224)); return cam / (cam.max() + 1e-8)
def heat_inside(mode, model):
    z = np.load(f"{OUT}/data_{mode}.npz"); X, sp, keys = z["X"].astype(np.float32), z["sp"], list(z["keys"])
    C = json.load(open(f"{S}/ml/circles_final.json")); fr = []; cams = []
    yy, xx = np.mgrid[0:224, 0:224]
    for i in np.where(sp == "test")[0]:
        cam = gradcam(model, X[i]); c = C[keys[i]]
        if mode == "crop": mask = np.hypot(xx - 112, yy - 112) <= 224 / 2.5
        else:
            H, W = c["h"], c["w"]; mask = np.hypot((xx/224 - c["cx"]) * W, (yy/224 - c["cy"]) * H) <= c["r"] * W
        fr.append(float(cam[mask].sum() / (cam.sum() + 1e-8))); cams.append((i, cam))
    return fr, cams
models = {t: tf.keras.models.load_model(f"{OUT}/netra_{t}.keras") for t in ("v1r_full", "v3_crop")}
hf, camf = heat_inside("full", models["v1r_full"]); hc, camc = heat_inside("crop", models["v3_crop"])
zf = np.load(f"{OUT}/data_full.npz"); zc = np.load(f"{OUT}/data_crop.npz")
C = json.load(open(f"{S}/ml/circles_final.json")); keys = list(zf["keys"])
iris_area = [np.pi * (C[keys[i]]["r"] * C[keys[i]]["w"])**2 / (C[keys[i]]["w"] * C[keys[i]]["h"]) for i, _ in camf]
R["gradcam_heat_inside_iris"] = {"v1r_full_mean": float(np.mean(hf)), "v1r_full_iris_area_share": float(np.mean(iris_area)), "v3_crop_mean": float(np.mean(hc)), "v3_crop_iris_area_share": float(np.pi/(2.5**2))}
fig, ax = plt.subplots(4, 8, figsize=(16, 8.4))
for j in range(8):
    (i, cf), (_, cc) = camf[j*4 % len(camf)], camc[j*4 % len(camc)]
    for r, (img, cam, title) in enumerate([(zf["X"][i], None, "full"), (zf["X"][i], cf, "v1r Grad-CAM"), (zc["X"][i], None, "crop"), (zc["X"][i], cc, "v3 Grad-CAM")]):
        ax[r, j].imshow(img); 
        if cam is not None: ax[r, j].imshow(cam, cmap="jet", alpha=.45)
        ax[r, j].set_xticks([]); ax[r, j].set_yticks([])
        if j == 0: ax[r, j].set_ylabel(title)
    ax[0, j].set_title(("cataract" if zf["y"][i] else "normal"), fontsize=9)
plt.tight_layout(); plt.savefig(f"{OUT}/gradcam_v1r_vs_v3.png", dpi=110); plt.close()

# Robustness: simulated capture problems on the test crops (blur, dark, bright, glare, noise, JPEG)
def degrade(img, kind, s):
    im = img.astype(np.float32)
    if kind == "blur": k = 2 * int(1 + 6 * s) + 1; im = cv2.GaussianBlur(im, (k, k), 0) if s > 0 else im
    if kind == "dark": im = im * (1 - 0.7 * s)
    if kind == "bright": im = im + (255 - im) * 0.6 * s
    if kind == "glare":
        yy, xx = np.mgrid[0:224, 0:224]; g = np.exp(-((xx - 140)**2 + (yy - 90)**2) / (2 * (10 + 25 * s)**2)) * 255 * s; im = im + g[..., None]
    if kind == "noise": im = im + np.random.default_rng(0).normal(0, 40 * s, im.shape)
    if kind == "jpeg" and s > 0:
        q = int(90 - 80 * s); ok, enc = cv2.imencode(".jpg", np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, q]); im = cv2.imdecode(enc, 1).astype(np.float32)
    return np.clip(im, 0, 255)
test = np.where(zc["sp"] == "test")[0]; yt = zc["y"][test]; sev = [0, .25, .5, .75, 1]
rob = {}
for kind in ("blur", "dark", "bright", "glare", "noise", "jpeg"):
    rob[kind] = []
    for s in sev:
        Xd = np.stack([degrade(zc["X"][i], kind, s) for i in test])
        p = models["v3_crop"].predict(Xd, verbose=0).ravel()
        rob[kind].append({"severity": s, "auc": float(roc_auc_score(yt, p)), "sens_at_thr": float(((p >= R["v3_crop"]["test"]["threshold"]) & (yt == 1)).sum() / (yt == 1).sum())})
R["robustness_v3"] = rob
plt.figure(figsize=(6, 4))
for kind, v in rob.items(): plt.plot(sev, [x["auc"] for x in v], marker="o", label=kind)
plt.xlabel("severity of simulated problem (0 = none)"); plt.ylabel("test ROC AUC (v3)"); plt.ylim(0.4, 1.0); plt.grid(alpha=.3); plt.legend(); plt.title("Robustness of v3 to capture problems")
plt.tight_layout(); plt.savefig(f"{OUT}/robustness_v3.png", dpi=130); plt.close()
ex = zc["X"][test[0]]
fig, ax = plt.subplots(1, 6, figsize=(12, 2.3))
for a, kind in zip(ax, rob): a.imshow(degrade(ex, kind, .75).astype(np.uint8)); a.set_title(kind); a.axis("off")
plt.tight_layout(); plt.savefig(f"{OUT}/robustness_examples.png", dpi=110); plt.close()

# ROC figure
plt.figure(figsize=(4.5, 4.2))
from sklearn.metrics import roc_curve
for t, lab in (("v1_original", "v1 original (full image)"), ("v1r_full", "v1r full image, same recipe"), ("v3_crop", "v3 pupil crop")):
    f, tpr, _ = roc_curve(yt if t == "v3_crop" else np.array(preds[t]["y"])[np.array(preds[t]["split"]) == "test"], pt[t]); plt.plot(f, tpr, label=f"{lab} AUC {R[t]['test']['auc']:.3f}")
plt.plot([0, 1], [0, 1], "k--", lw=.8); plt.xlabel("1 – specificity"); plt.ylabel("sensitivity"); plt.legend(fontsize=7); plt.tight_layout(); plt.savefig(f"{OUT}/roc_test.png", dpi=130); plt.close()

# Export v3: TFLite (float16) and check decisions match Keras on the test set
conv = tf.lite.TFLiteConverter.from_keras_model(models["v3_crop"]); conv.optimizations = [tf.lite.Optimize.DEFAULT]; conv.target_spec.supported_types = [tf.float16]
tfl = conv.convert(); open(f"{OUT}/netra_v3_crop.tflite", "wb").write(tfl)
it = tf.lite.Interpreter(model_content=tfl); it.allocate_tensors(); ii, oo = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]
pk = models["v3_crop"].predict(zc["X"][test].astype(np.float32), verbose=0).ravel(); pl = []
for i in test: it.set_tensor(ii, zc["X"][i][None].astype(np.float32)); it.invoke(); pl.append(float(it.get_tensor(oo)[0, 0]))
pl = np.array(pl); thr = R["v3_crop"]["test"]["threshold"]
R["tflite_check"] = {"size_mb": round(len(tfl) / 1e6, 2), "max_abs_diff": float(np.abs(pk - pl).max()), "same_decisions": int(((pk >= thr) == (pl >= thr)).sum()), "n": int(len(test))}
json.dump({"version": "v3.0-pupil-crop", "threshold": thr, "min_sensitivity_target": 0.95, "img_size": 224,
           "input": "pupil crop: square side 2.5*r*W centred on the circle, black padding, RGB 0-255, no normalisation (same as app cropPupil)",
           "positive_class": "cataract", "n_train": int((zc["sp"] == "train").sum()), "seed": 42,
           "warning": "Trained on web images with visual (AI-assisted) circle annotation; research use only, not validated on patients."}, open(f"{OUT}/model_meta_v3.json", "w"), indent=1)
json.dump(R, open(f"{OUT}/results_v3.json", "w"), indent=1)
print(json.dumps(R, indent=1)[:4000])
