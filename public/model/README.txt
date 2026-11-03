Netra AI research model v3.1-pupil-crop-clean (TF.js graph model).
Input: pupil crop exactly as src/lib/image.ts cropPupil (square side 2.5*r*W, 224x224, RGB 0-255, black padding).
Output: probability of cataract. Two-tier band (registered in model_runs, migration 0009):
  score >= 0.5      -> refer (likely cataract)
  score >= 0.3273   -> doctor review (borderline; Youden threshold on inner validation)
  otherwise         -> negative (10% randomly audited)
Architecture: MobileNetV2, ImageNet initialisation. Trained on 212 de-duplicated public web images whose labels were reviewed by one clinician.
Out-of-fold AUC 0.976 (5-fold); locked test AUC 0.996 (32 images).
Runs on WebGL, else WASM SIMD (public/tfjs/*.wasm), else CPU.
Research use only; not validated on patients.
