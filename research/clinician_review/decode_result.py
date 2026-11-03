"""Decode a result code from the Netra Photo Check page: python decode_result.py "NQ1;name;A:...;B:...;t:.." """
import json, sys
M = json.load(open(__file__.rsplit("/", 1)[0] + "/qc_map.json")); code = sys.argv[1].strip()
parts = dict(p.split(":", 1) for p in code.split(";")[2:] if ":" in p); name = code.split(";")[1]
A = parts.get("A", ""); B = [int(x) for x in parts.get("B", "").split(",") if x]
rows = []
for idx, v in zip(M["partA"], A):
    lab = "cataract" if M["labels"][idx] else "normal"; doc = {"c": "cataract", "n": "normal", "u": "ungradable", "-": None}[v]
    rows.append({"idx": idx, "key": M["keys"][idx], "part": "A", "set": "suspicious" if idx in M["partA_suspicious"] else "random", "label": lab, "doctor": doc})
for idx in M["B_cat"] + M["B_nor"]:
    lab = "cataract" if M["labels"][idx] else "normal"
    rows.append({"idx": idx, "key": M["keys"][idx], "part": "B", "label": lab, "doctor": ("disputed" if idx in B else lab)})
json.dump({"reviewer": name, "minutes": parts.get("t"), "rows": rows}, open("qc_result.json", "w"), indent=1)
rnd = [r for r in rows if r.get("set") == "random" and r["doctor"] in ("cataract", "normal")]
agree = sum(r["doctor"] == r["label"] for r in rnd)
print(f"reviewer={name}; random-sample agreement {agree}/{len(rnd)}; suspicious changed: {sum(1 for r in rows if r.get('set')=='suspicious' and r['doctor'] not in (r['label'], None))}; part B disputed: {len(B)}")
