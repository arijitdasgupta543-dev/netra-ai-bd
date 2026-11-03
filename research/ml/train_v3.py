"""Netra AI v3: train on tight iris/pupil crops (same geometry as the app's cropPupil: side 2.5r, 224 px)
and compare with a full-image model trained with the identical recipe and initialisation."""
import json, sys, os, numpy as np, cv2, tensorflow as tf
from tensorflow.keras import layers, models
tf.keras.utils.set_random_seed(42)
S = sys.argv[1]; OUT = f"{S}/ml/out"; os.makedirs(OUT, exist_ok=True)
C = json.load(open(f"{S}/ml/circles_final.json"))
V1 = tf.keras.models.load_model("/mnt/user-data/uploads/Netra_AI/netra_outputs/netra_mobilenetv2.keras")
IMG = 224

def crop(img, c):
    """Exactly mirrors src/lib/image.ts cropPupil: square side 2.5*r*W centred on circle, black outside."""
    H, W = img.shape[:2]; side = 2.5 * c["r"] * W; sx = c["cx"] * W - side / 2; sy = c["cy"] * H - side / 2
    M = np.float32([[IMG / side, 0, -sx * IMG / side], [0, IMG / side, -sy * IMG / side]])
    return cv2.warpAffine(img, M, (IMG, IMG), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def load(mode):
    X, y, sp, keys = [], [], [], []
    for k, c in sorted(C.items()):
        img = cv2.cvtColor(cv2.imread(f"{S}/data/Netra_AI/{k}"), cv2.COLOR_BGR2RGB)
        X.append(crop(img, c) if mode == "crop" else cv2.resize(img, (IMG, IMG), interpolation=cv2.INTER_AREA))
        y.append(1 if c["label"] == "cataract" else 0); sp.append(c["split"]); keys.append(k)
    return np.array(X, np.float32), np.array(y, np.float32), np.array(sp), keys

def build():
    m = tf.keras.models.clone_model(V1); m.set_weights(V1.get_weights())  # same architecture + init for both arms
    head = m.get_layer("p_cataract"); w, b = head.get_weights()
    head.set_weights([np.random.default_rng(42).normal(0, 0.01, w.shape).astype(np.float32), np.zeros_like(b)])  # fresh head
    return m

def set_trainable(model, n):
    names = [l.name for l in model.layers]; gi, ri = names.index("gap"), names.index("rescale")
    for i, l in enumerate(model.layers):
        if i <= ri: continue
        l.trainable = ((i >= gi - n) and not isinstance(l, layers.BatchNormalization)) if i < gi else True

def fit(X, y, sp, tag):
    m = build(); tr, va = sp == "train", sp == "val"
    cw = {0: len(y[tr]) / (2 * (y[tr] == 0).sum()), 1: len(y[tr]) / (2 * (y[tr] == 1).sum())}
    cb = lambda: [tf.keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=5, restore_best_weights=True),
                  tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7)]
    hist = {}
    for n, lr, ep in ((0, 1e-3, 15), (30, 1e-5, 15)):
        set_trainable(m, n); m.compile(tf.keras.optimizers.Adam(lr), "binary_crossentropy", metrics=["accuracy", tf.keras.metrics.AUC(name="auc")])
        h = m.fit(X[tr], y[tr], validation_data=(X[va], y[va]), epochs=ep, batch_size=16, class_weight=cw, callbacks=cb(), verbose=0)
        for k, v in h.history.items(): hist.setdefault(k, []).extend(float(x) for x in v)
    m.save(f"{OUT}/netra_{tag}.keras"); json.dump(hist, open(f"{OUT}/history_{tag}.json", "w"))
    return m

if __name__ == "__main__":
    for mode, tag in (("full", "v1r_full"), ("crop", "v3_crop")):
        X, y, sp, keys = load(mode)
        np.savez_compressed(f"{OUT}/data_{mode}.npz", X=X.astype(np.uint8), y=y, sp=sp, keys=np.array(keys))
        m = fit(X, y, sp, tag)
        p = m.predict(X, verbose=0).ravel()
        json.dump({"keys": keys, "p": p.tolist(), "y": y.tolist(), "split": sp.tolist()}, open(f"{OUT}/pred_{tag}.json", "w"))
        print(tag, "done")
    # original v1 on the same full-image inputs (reference)
    X, y, sp, keys = load("full")
    p = V1.predict(X, verbose=0).ravel()
    json.dump({"keys": keys, "p": p.tolist(), "y": y.tolist(), "split": sp.tolist()}, open(f"{OUT}/pred_v1_original.json", "w"))
    print("v1 original scored")
