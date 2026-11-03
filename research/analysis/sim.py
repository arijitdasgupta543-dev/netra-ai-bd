import numpy as np
rng=np.random.default_rng(1)
def run(N,prev=0.30,sens=0.85,spec=0.80,r=0.05,reps=4000,lv_fn=0.5,lv_tn=0.15,mode="correct"):
    est=[];cov=0;wid=[]
    for _ in range(reps):
        d=rng.random(N)<prev
        pos=np.where(d,rng.random(N)<sens,rng.random(N)>spec)
        TP=(d&pos).sum()
        neg=~pos
        lv=np.where(d,rng.random(N)<lv_fn,rng.random(N)<lv_tn)&neg   # low-vision field referral among AI-negatives
        samp=neg&(rng.random(N)<r)
        if mode=="correct":   # stratified: all low-vision negatives reviewed (p=1); others sampled at r
            FN=(d&lv).sum()+ (d&samp&~lv).sum()/r
        else:                 # current DB: low-vision upgrade erases audit flag -> analyst counts only rows still marked audit
            FN=(d&samp&~lv).sum()/r
        s=TP/(TP+FN); est.append(s)
    est=np.array(est)
    lo,hi=np.percentile(est,[2.5,97.5])
    return est.mean()-sens, hi-lo
for N in [300,2000,20000]:
    for r in [0.02,0.05,0.10]:
        b,w=run(N,r=r); print(f"N={N:6d} r={r:.2f} correct: bias={b:+.3f} 95%range={w:.3f}")
for N in [2000,20000]:
    b,w=run(N,mode="buggy"); print(f"N={N} r=0.05 BUGGY (flag lost): bias={b:+.3f} 95%range={w:.3f}")
# workload at operating points
for name,se,sp in [("thr 0.0691 (val rule)",18/18,3/16),("thr 0.5",16/18,15/16)]:
    for p in [0.15,0.30]:
        pr=p*se+(1-p)*(1-sp); print(f"{name} prev={p}: positive rate={pr:.2f} -> reviews/day of 40000 eyes ~{pr*40000:,.0f} (+5% audit of negatives)")
