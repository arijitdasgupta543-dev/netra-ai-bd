"""Iris finder v2: many Hough candidates scored by limbus evidence (bright sclera beside a darker disc + strong radial edge)."""
import json, sys, cv2, numpy as np
S=sys.argv[1]; C=json.load(open(f"{S}/ml/circles_auto.json"))
def score(g, gx, gy, x, y, r):
    h, w = g.shape
    ang = np.concatenate([np.linspace(-0.6, 0.6, 24), np.linspace(np.pi-0.6, np.pi+0.6, 24)])  # left/right sides only (lids cover top/bottom)
    def samp(rr):
        xs = np.clip((x + rr*np.cos(ang)).astype(int), 0, w-1); ys = np.clip((y + rr*np.sin(ang)).astype(int), 0, h-1)
        return xs, ys
    xi, yi = samp(0.8*r); xo, yo = samp(1.25*r); xe, ye = samp(r)
    inside = g[yi, xi].mean(); outside = g[yo, xo].mean()
    valid = ((x + 1.25*r*np.cos(ang) >= 0) & (x + 1.25*r*np.cos(ang) < w)).mean()
    radial = (gx[ye, xe]*np.cos(ang) + gy[ye, xe]*np.sin(ang)).mean()  # positive = brighter outward
    return (outside - inside) * 0.5 + radial * 0.5 - (1 - valid) * 60
out = {}
for k, c in C.items():
    img = cv2.imread(f"{S}/data/Netra_AI/{k}"); h, w = img.shape[:2]
    sc = 400 / max(h, w); im = cv2.resize(img, (int(w*sc), int(h*sc))); H, W = im.shape[:2]
    g = cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32), (5, 5), 0)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    m = min(H, W); cands = []
    for p2 in (40, 30, 22, 16):
        cs = cv2.HoughCircles(g.astype(np.uint8), cv2.HOUGH_GRADIENT, dp=1.5, minDist=m/12, param1=90, param2=p2, minRadius=int(m*.07), maxRadius=int(m*.48))
        if cs is not None: cands += [tuple(x) for x in cs[0][:40]]
        if len(cands) > 60: break
    if c["method"] == "mediapipe": out[k] = c; continue
    if not cands: out[k] = {**c, "method": "default"}; continue
    best = max(cands, key=lambda t: score(g, gx, gy, *t))
    out[k] = {**c, "cx": float(best[0]/W), "cy": float(best[1]/H), "r": float(best[2]/W), "method": "hough2"}
json.dump(out, open(f"{S}/ml/circles_v2.json", "w"), indent=1)
