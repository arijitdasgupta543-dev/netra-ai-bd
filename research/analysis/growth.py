import json
MEAS_TPS = 668  # measured screening saves/s (8 clients, 2 vCPU, 200k patients)
rows = []
for w, name in [(10, "Pilot"), (100, "District"), (1000, "Division"), (10000, "National")]:
    pts = w * 20; eyes = pts * 2
    crop_gb = eyes * 55e3 / 1e9                      # pupil crop + thumbnail ≈ 55 KB per eye
    full_gb = pts * 0.10 * 2 * 400e3 / 1e9           # full photographs kept for a 10% sample
    day_gb = crop_gb + full_gb
    storm = pts / 3600                                # whole day's screenings uploaded within one hour
    rows.append({"stage": name, "workers": w, "patients_day": pts, "eyes_day": eyes, "storage_gb_day": round(day_gb, 2),
                 "storage_tb_year": round(day_gb * 300 / 1000, 2), "avg_tps_8h": round(pts / (8 * 3600), 3),
                 "storm_tps_1h": round(storm, 2), "headroom_x": round(MEAS_TPS / storm)})
json.dump(rows, open("growth.json", "w"), indent=1)
for r in rows: print(r)
