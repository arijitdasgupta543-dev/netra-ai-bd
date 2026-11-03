import sys, shutil
sys.path.insert(0, sys.argv[1] + "/ml/stubs")
import tensorflow as tf, tensorflowjs as tfjs, numpy as np, json
S = sys.argv[1]; O = f"{S}/ml/out"
full = tf.keras.models.load_model(f"{O}/netra_v3_crop.keras")
# inference graph without the random-augmentation layers (identity at inference; they hold RNG state)
m = tf.keras.Model(full.get_layer("rescale").input, full.output)
z = np.load(f"{O}/data_crop.npz"); xt = z["X"][z["sp"] == "test"].astype(np.float32)
assert np.abs(m.predict(xt, verbose=0) - full.predict(xt, verbose=0)).max() < 1e-4, "inference graph differs"
w = tf.Module(); w.m = m
def _serve(image): return {"p_cataract": m(image, training=False)}
w.serve = tf.function(_serve, input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name="image")])
shutil.rmtree(f"{O}/saved_v3", ignore_errors=True); shutil.rmtree(f"{O}/tfjs_v3", ignore_errors=True)
tf.saved_model.save(w, f"{O}/saved_v3", signatures={"serving_default": w.serve})
tfjs.converters.convert_tf_saved_model(f"{O}/saved_v3", f"{O}/tfjs_v3", signature_def="serving_default", saved_model_tags="serve")
print(json.load(open(f"{O}/tfjs_v3/model.json"))["format"])
