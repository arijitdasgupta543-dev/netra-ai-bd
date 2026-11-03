"""Find the iris circle on each clean image: MediaPipe FaceLandmarker (same model as the app), Hough fallback."""
import csv, json, sys, os, cv2, numpy as np, mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
S = sys.argv[1]; DATA = f"{S}/data/Netra_AI"; MAN = sys.argv[2]; OUT = f"{S}/ml/circles_auto.json"
lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=f"{S}/repo/public/mediapipe/face_landmarker.task"), num_faces=2))
rows = list(csv.DictReader(open(MAN)))
def mp_circle(img):
    h, w = img.shape[:2]
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    best = None
    for face in res.face_landmarks:
        for idx in (468, 473):
            c = face[idx]; ring = face[idx+1:idx+5]
            rs = [np.hypot((p.x-c.x)*w, (p.y-c.y)*h) for p in ring]
            r = max(rs)
            if min(rs)/r < .55: continue
            cand = (c.x, c.y, r / w)
            # prefer the bigger iris (closest eye) – web photos are usually one dominant eye
            if best is None or cand[2] > best[2]: best = cand
    return best
def hough_circle(img):
    h, w = img.shape[:2]; g = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 5)
    m = min(h, w)
    cs = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT, dp=1.2, minDist=m/2, param1=100, param2=30, minRadius=int(m*.08), maxRadius=int(m*.45))
    if cs is None: return None
    # choose the circle nearest the image centre (photos are framed on the eye)
    cs = sorted(cs[0], key=lambda c: np.hypot(c[0]-w/2, c[1]-h/2))
    x, y, r = cs[0]; return (x/w, y/h, r/w)
out = {}
stats = {"mediapipe": 0, "hough": 0, "none": 0}
for r in rows:
    p = f"{DATA}/{r['rel']}"
    img = cv2.imread(p)
    if img is None: stats["none"] += 1; continue
    c = mp_circle(img); method = "mediapipe"
    if c is None: c = hough_circle(img); method = "hough"
    if c is None: c = (0.5, 0.5, 0.25); method = "default"
    stats[method if method in stats else "none"] += 1
    out[r['rel']] = {"cx": float(c[0]), "cy": float(c[1]), "r": float(c[2]), "method": method, "w": img.shape[1], "h": img.shape[0], "label": r["label"], "split": r["split"]}
json.dump(out, open(OUT, "w"), indent=1); print(stats, len(out))
