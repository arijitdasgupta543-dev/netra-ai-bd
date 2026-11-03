import sys, shutil, json, numpy as np
sys.path.insert(0, sys.argv[1] + "/ml/stubs")
import tensorflowjs as tfjs
S = sys.argv[1]; O = f"{S}/ml/clean5"
shutil.rmtree(f"{O}/tfjs", ignore_errors=True)
tfjs.converters.convert_tf_saved_model(f"{O}/saved", f"{O}/tfjs", signature_def="serving_default", saved_model_tags="serve")
z = np.load(f"{S}/ml/out/data_crop_v5.npz", allow_pickle=True); xt = z["X"][z["sp"] == "test"].astype(np.uint8)
xt.tofile(f"{O}/tfjs/test_crops_u8.bin"); json.dump({"n": int(len(xt))}, open(f"{O}/tfjs/test_meta.json", "w"))
print(json.load(open(f"{O}/tfjs/model.json"))["format"], len(xt))
