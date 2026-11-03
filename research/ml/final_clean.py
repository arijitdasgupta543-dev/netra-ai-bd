"""Clean (ImageNet-initialised) MobileNetV2 on the original locked split: pupil crop vs full image, same recipe.
Evaluates the 34-image test split once, robustness to simulated capture problems, and conversion fidelity
(TFLite float16 and TF.js graph model). Produces the candidate deployable model v3.1 (no V1 initialisation)."""
import json, sys, os, shutil, numpy as np, cv2, tensorflow as tf
from tensorflow.keras import layers
from sklearn.metrics import roc_auc_score
S = sys.argv[1]; O = f"{S}/ml/clean5"; os.makedirs(O, exist_ok=True)
W = f"{S}/weights/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5"

def build(seed=42):
    tf.keras.utils.set_random_seed(seed)
    base = tf.keras.applications.MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights=W)
    inp = layers.Input((224, 224, 3), name="image"); x = inp
    for a in [layers.RandomFlip("horizontal"), layers.RandomRotation(0.06), layers.RandomZoom(0.1), layers.RandomContrast(0.15), layers.RandomBrightness(0.15, value_range=(0, 255))]: x = a(x)
    r = layers.Rescaling(1 / 127.5, offset=-1, name="rescale"); x = r(x)
    x = base(x, training=False); x = layers.GlobalAveragePooling2D(name="gap")(x); x = layers.Dropout(0.3)(x)
    out = layers.Dense(1, activation="sigmoid", name="p_cataract")(x)
    m = tf.keras.Model(inp, out)
    def set_trainable(n):
        base.trainable = n > 0
        if n > 0:
            for i, l in enumerate(base.layers): l.trainable = (i >= len(base.layers) - n) and not isinstance(l, layers.BatchNormalization)
    return m, set_trainable

def fit(X, y, tr, va):
    m, st = build()
    cw = {0: tr.sum() / (2 * (y[tr] == 0).sum()), 1: tr.sum() / (2 * (y[tr] == 1).sum())}
    for n, lr, ep in ((0, 1e-3, 15), (30, 1e-5, 15)):
        st(n); m.compile(tf.keras.optimizers.Adam(lr), "binary_crossentropy", metrics=[tf.keras.metrics.AUC(name="auc")])
        m.fit(X[tr], y[tr], validation_data=(X[va], y[va]), epochs=ep, batch_size=16, class_weight=cw, verbose=0,
              callbacks=[tf.keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=5, restore_best_weights=True),
                         tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7)])
    return m

def thr_rules(p, t):
    cand = np.unique(np.concatenate([p, [0.5]]))
    youden = max(((p[t == 1] >= c).mean() + (p[t == 0] < c).mean() - 1, c) for c in cand)[1]
    ok = [c for c in cand if (p[t == 1] >= c).mean() >= 0.95]
    return float(youden), float(max(ok) if ok else cand.min())

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

R = {}; models = {}
for mode in ("crop", "full"):
    z = np.load(f"{S}/ml/out/data_{mode}_v5.npz", allow_pickle=True); X, y, sp = z["X"].astype(np.float32), z["y"], z["sp"]
    tr, va, te = sp == "train", sp == "val", sp == "test"
    m = fit(X, y, tr, va); models[mode] = m
    pv, pt = m.predict(X[va], verbose=0).ravel(), m.predict(X[te], verbose=0).ravel()
    ty, ts = thr_rules(pv, y[va])
    R[mode] = {"val_auc": float(roc_auc_score(y[va], pv)), "test_auc": float(roc_auc_score(y[te], pt)), "thr_youden": ty, "thr_s95": ts,
               "p_test": pt.tolist(), "y_test": y[te].tolist()}
    m.save(f"{O}/netra_clean_{mode}.keras"); print(mode, R[mode]["val_auc"], R[mode]["test_auc"], flush=True)
# paired bootstrap of the AUC difference on the same test images
yt = np.array(R["crop"]["y_test"]); a, b = np.array(R["crop"]["p_test"]), np.array(R["full"]["p_test"]); rng = np.random.default_rng(0); d = []
while len(d) < 2000:
    i = rng.integers(0, len(yt), len(yt))
    if yt[i].min() == yt[i].max(): continue
    d.append(roc_auc_score(yt[i], a[i]) - roc_auc_score(yt[i], b[i]))
R["auc_diff_crop_minus_full"] = [float(roc_auc_score(yt, a) - roc_auc_score(yt, b)), float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]
# robustness of the crop model
z = np.load(f"{S}/ml/out/data_crop_v5.npz", allow_pickle=True); te = np.where(z["sp"] == "test")[0]; yt = z["y"][te]; rob = {}
for kind in ("blur", "dark", "bright", "glare", "noise", "jpeg"):
    rob[kind] = []
    for s in (0, .25, .5, .75, 1):
        p = models["crop"].predict(np.stack([degrade(z["X"][i], kind, s) for i in te]), verbose=0).ravel()
        rob[kind].append({"severity": s, "auc": float(roc_auc_score(yt, p))})
R["robustness_crop"] = rob
# conversion fidelity: inference graph without augmentation -> TFLite fp16 + TF.js
full = models["crop"]; inf = tf.keras.Model(full.get_layer("rescale").input, full.output)
xt = z["X"][te].astype(np.float32); pk = full.predict(xt, verbose=0).ravel()
assert np.abs(inf.predict(xt, verbose=0).ravel() - pk).max() < 1e-4
conv = tf.lite.TFLiteConverter.from_keras_model(inf); conv.optimizations = [tf.lite.Optimize.DEFAULT]; conv.target_spec.supported_types = [tf.float16]
tfl = conv.convert(); open(f"{O}/netra_v3_1_crop.tflite", "wb").write(tfl)
it = tf.lite.Interpreter(model_content=tfl); it.allocate_tensors(); ii, oo = it.get_input_details()[0]["index"], it.get_output_details()[0]["index"]; pl = []
for x in xt: it.set_tensor(ii, x[None]); it.invoke(); pl.append(float(it.get_tensor(oo)[0, 0]))
R["tflite"] = {"size_mb": round(len(tfl) / 1e6, 2), "max_abs_diff": float(np.abs(pk - np.array(pl)).max()), "p": pl}
w = tf.Module(); w.m = inf
w.serve = tf.function(lambda image: {"p_cataract": inf(image, training=False)}, input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="image")])
shutil.rmtree(f"{O}/saved", ignore_errors=True); tf.saved_model.save(w, f"{O}/saved", signatures={"serving_default": w.serve})
R["keras_p_test"] = pk.tolist()
json.dump(R, open(f"{O}/results_clean.json", "w"), indent=1); print("DONE", R["auc_diff_crop_minus_full"], R["tflite"]["size_mb"], R["tflite"]["max_abs_diff"])
