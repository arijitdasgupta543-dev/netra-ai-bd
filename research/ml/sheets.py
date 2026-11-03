import json, sys, cv2, numpy as np
S=sys.argv[1]; src=sys.argv[2]; prefix=sys.argv[3]
C=json.load(open(src)); keys=sorted(C)
T=220; cols=6; per=30
for s in range(0,len(keys),per):
    tiles=[]
    for i,k in enumerate(keys[s:s+per]):
        c=C[k]; img=cv2.imread(f"{S}/data/Netra_AI/{k}"); h,w=img.shape[:2]; sc=T/max(h,w)
        im=cv2.resize(img,(int(w*sc),int(h*sc))); canvas=np.full((T,T,3),40,np.uint8); canvas[:im.shape[0],:im.shape[1]]=im
        for g in range(1,10):
            cv2.line(canvas,(int(g*w*sc/10),0),(int(g*w*sc/10),3),(255,255,0),1); cv2.line(canvas,(0,int(g*h*sc/10)),(3,int(g*h*sc/10)),(255,255,0),1)
        col=(0,255,0) if c['method']=='mediapipe' else (0,200,255) if c['method']=='hough' else (0,0,255)
        cv2.circle(canvas,(int(c['cx']*w*sc),int(c['cy']*h*sc)),max(2,int(c['r']*w*sc)),col,2)
        cv2.putText(canvas,str(s+i),(4,18),cv2.FONT_HERSHEY_SIMPLEX,.6,(0,0,0),3); cv2.putText(canvas,str(s+i),(4,18),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),1)
        tiles.append(canvas)
    while len(tiles)%cols: tiles.append(np.zeros((T,T,3),np.uint8))
    rows=[np.hstack(tiles[r:r+cols]) for r in range(0,len(tiles),cols)]
    cv2.imwrite(f"{S}/ml/{prefix}_{s//per}.jpg",np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,85])
print(len(keys))
