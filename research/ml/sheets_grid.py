import json, sys, cv2, numpy as np
S=sys.argv[1]; src=sys.argv[2]; prefix=sys.argv[3]; only=sys.argv[4].split(',') if len(sys.argv)>4 and sys.argv[4] else None
C=json.load(open(src)); keys=sorted(C)
idx=list(range(len(keys))) if not only else [int(i) for i in only]
T=300; cols=4; per=16
for s in range(0,len(idx),per):
    tiles=[]
    for i in idx[s:s+per]:
        k=keys[i]; c=C[k]; img=cv2.imread(f"{S}/data/Netra_AI/{k}"); h,w=img.shape[:2]
        im=cv2.resize(img,(T,T))  # stretch to square so grid fractions map directly to x/w and y/h
        for g in range(1,10):
            col=(255,255,255) if g%5 else (0,255,255)
            cv2.line(im,(g*T//10,0),(g*T//10,T),col,1); cv2.line(im,(0,g*T//10),(T,g*T//10),col,1)
        cx,cy=int(c['cx']*T),int(c['cy']*T); rx=int(c['r']*T); ry=int(c['r']*w/h*T)
        cv2.ellipse(im,(cx,cy),(max(rx,2),max(ry,2)),0,0,360,(0,0,255),2)
        cv2.putText(im,str(i),(4,22),cv2.FONT_HERSHEY_SIMPLEX,.7,(0,0,0),4); cv2.putText(im,str(i),(4,22),cv2.FONT_HERSHEY_SIMPLEX,.7,(0,255,0),2)
        tiles.append(cv2.copyMakeBorder(im,3,3,3,3,cv2.BORDER_CONSTANT,value=(0,0,0)))
    while len(tiles)%cols: tiles.append(np.zeros_like(tiles[0]))
    rows=[np.hstack(tiles[r:r+cols]) for r in range(0,len(tiles),cols)]
    cv2.imwrite(f"{S}/ml/{prefix}_{s//per:02d}.jpg",np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,88])
