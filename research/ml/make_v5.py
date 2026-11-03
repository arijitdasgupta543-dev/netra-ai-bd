"""Apply the clinician label review (second pass) to the pupil-crop and full-image arrays.
Input : ml/out/data_{crop,full}.npz (written by train_v3.py) and data/label_corrections_v5.json
Output: ml/out/data_{crop,full}_v5.npz with keys X, y, sp, keys, y_orig (212 images)
Usage : python make_v5.py <root>"""
import json, sys, numpy as np
R = sys.argv[1] if len(sys.argv) > 1 else "."
corr = {c["key"]: c["doctor"] for c in json.load(open(f"{R}/data/label_corrections_v5.json"))["changed_or_excluded"]}
for mode in ("crop", "full"):
    z = np.load(f"{R}/ml/out/data_{mode}.npz", allow_pickle=True)
    keep, y = [], []
    for i, k in enumerate(z["keys"]):
        d = corr.get(str(k))
        if d in ("ungradable", "disputed"): continue
        keep.append(i); y.append(1.0 if d == "cataract" else 0.0 if d == "normal" else float(z["y"][i]))
    keep = np.array(keep)
    np.savez_compressed(f"{R}/ml/out/data_{mode}_v5.npz", X=z["X"][keep], y=np.array(y, dtype=z["y"].dtype),
                        sp=z["sp"][keep], keys=z["keys"][keep], y_orig=z["y"][keep])
    print(mode, len(keep), "images,", int(sum(y)), "cataract")
