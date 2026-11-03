-- 0009: register model v3.1 (MobileNetV2 on pupil crops, ImageNet initialisation, clinician-reviewed labels)
-- and make it the active model. Same file path as v3.0, so apply together with the new public/model files.
-- Thresholds: refer >= 0.5 (urgent); review >= 0.3273 (Youden threshold on the validation split).
UPDATE public.model_runs SET active = false WHERE active;
INSERT INTO public.model_runs (version, model_url, threshold, review_threshold, metrics, notes, active) VALUES
 ('v3.1-pupil-crop-clean', '/model/model.json', 0.5, 0.3273,
  '{"oof_auc_5fold":0.976,"locked_test_auc":0.996,"test_n":32,"data":"212 public web images, labels reviewed by one clinician; research only"}',
  'MobileNetV2, ImageNet init, pupil crop 2.5r 224px RGB 0-255. Not validated on patients.', true);
