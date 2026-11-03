"""Netra AI — model experiments for the paper (repeated stratified 5-fold cross-validation, out-of-fold scores).
Arm = <input>_<backbone>: input in {crop, full}; backbone in {mnv2, densenet121, resnet50, vgg16, v1}.
All backbones except v1 start from ImageNet weights (clean). v1 = the earlier model trained on the original Kaggle
split, which overlaps our images, included only to measure optimism from that initialisation.
Inner validation (20% of the training folds) is used for early stopping and threshold choice; the held-out fold
is never used for any decision. Each fold is saved separately so the run can resume.
Usage: python train_cv.py <scratch> <arm> <repeat>
"""
import json, sys, os, time, numpy as np, tensorflow as tf
from tensorflow.keras import layers
from sklearn.model_selection import StratifiedKFold, train_test_split

S, ARM, REP = sys.argv[1], sys.argv[2], int(sys.argv[3])
OUT = f"{S}/ml/cv5"; os.makedirs(OUT, exist_ok=True)
mode, bb = ARM.split("_", 1)
D = np.load(f"{S}/ml/out/data_{mode}_v5.npz", allow_pickle=True)
X, y, keys = D["X"].astype(np.float32), D["y"].astype(np.float32), D["keys"]
W = f"{S}/weights/"
V1_PATH = "/mnt/user-data/uploads/Netra_AI/netra_outputs/netra_mobilenetv2.keras"
A = tf.keras.applications
BACKBONES = {  # constructor, weights file, preprocessing on 0-255 RGB, layers unfrozen in stage 2
    "mnv2": (A.MobileNetV2, "mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5", A.mobilenet_v2.preprocess_input, 30),
    "densenet121": (A.DenseNet121, "densenet121_weights_tf_dim_ordering_tf_kernels_notop.h5", A.densenet.preprocess_input, 30),
    "resnet50": (A.ResNet50, "resnet50_weights_tf_dim_ordering_tf_kernels_notop.h5", A.resnet50.preprocess_input, 30),
    "vgg16": (A.VGG16, "vgg16_weights_tf_dim_ordering_tf_kernels_notop.h5", A.vgg16.preprocess_input, 4),
}

def augment():
    return [layers.RandomFlip("horizontal"), layers.RandomRotation(0.06), layers.RandomZoom(0.1),
            layers.RandomContrast(0.15), layers.RandomBrightness(0.15, value_range=(0, 255))]

def build(seed):
    tf.keras.utils.set_random_seed(seed)
    if bb == "v1":
        V1 = tf.keras.models.load_model(V1_PATH)
        m = tf.keras.models.clone_model(V1); m.set_weights(V1.get_weights())
        head = m.get_layer("p_cataract"); w, b = head.get_weights()
        head.set_weights([np.random.default_rng(seed).normal(0, 0.01, w.shape).astype(np.float32), np.zeros_like(b)])
        names = [l.name for l in m.layers]; gi, ri = names.index("gap"), names.index("rescale")
        def set_trainable(n):
            for i, l in enumerate(m.layers):
                if i <= ri: continue
                l.trainable = ((i >= gi - n) and not isinstance(l, layers.BatchNormalization)) if i < gi else True
        return m, set_trainable, 30
    ctor, wf, prep, nun = BACKBONES[bb]
    base = ctor(input_shape=(224, 224, 3), include_top=False, weights=W + wf)
    inp = layers.Input((224, 224, 3), name="image"); x = inp
    for a in augment(): x = a(x)
    x = layers.Lambda(prep, name="preprocess")(x)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D(name="gap")(x); x = layers.Dropout(0.3)(x)
    out = layers.Dense(1, activation="sigmoid", name="p_cataract")(x)
    m = tf.keras.Model(inp, out)
    def set_trainable(n):
        base.trainable = n > 0
        if n > 0:
            for i, l in enumerate(base.layers):
                l.trainable = (i >= len(base.layers) - n) and not isinstance(l, layers.BatchNormalization)
    return m, set_trainable, nun

def fit(Xtr, ytr, Xva, yva, seed):
    m, set_trainable, nun = build(seed)
    cw = {0: len(ytr) / (2 * (ytr == 0).sum()), 1: len(ytr) / (2 * (ytr == 1).sum())}
    for n, lr, ep in ((0, 1e-3, 15), (nun, 1e-5, 15)):
        set_trainable(n)
        m.compile(tf.keras.optimizers.Adam(lr), "binary_crossentropy", metrics=[tf.keras.metrics.AUC(name="auc")])
        cb = [tf.keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=5, restore_best_weights=True),
              tf.keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7)]
        m.fit(Xtr, ytr, validation_data=(Xva, yva), epochs=ep, batch_size=16, class_weight=cw, callbacks=cb, verbose=0)
    return m

def thresholds(p, t):
    """Chosen on inner validation only: Youden J, and highest threshold with sensitivity >= 0.95."""
    cand = np.unique(np.concatenate([p, [0.5]]))
    youden = max(((p[t == 1] >= c).mean() + (p[t == 0] < c).mean() - 1, c) for c in cand)[1]
    ok = [c for c in cand if (p[t == 1] >= c).mean() >= 0.95]
    return float(youden), float(max(ok) if ok else cand.min())

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=100 + REP)
for f, (tr_i, te_i) in enumerate(skf.split(X, y)):
    fp = f"{OUT}/{ARM}_r{REP}_f{f}.json"
    if os.path.exists(fp): continue
    t0 = time.time(); seed = 1000 * REP + f
    tr2, va = train_test_split(tr_i, test_size=0.2, stratify=y[tr_i], random_state=seed)
    m = fit(X[tr2], y[tr2], X[va], y[va], seed)
    pva = m.predict(X[va], verbose=0).ravel(); pte = m.predict(X[te_i], verbose=0).ravel()
    ty, ts = thresholds(pva, y[va])
    json.dump({"arm": ARM, "repeat": REP, "fold": f, "test_idx": te_i.tolist(), "p_test": pte.tolist(), "y_test": y[te_i].tolist(),
               "thr_youden": ty, "thr_s95": ts, "secs": round(time.time() - t0, 1), "params": int(m.count_params())}, open(fp, "w"))
    print(ARM, REP, f, "done", round(time.time() - t0), "s", flush=True)
    tf.keras.backend.clear_session()
print("FINISHED", ARM, REP, flush=True)
