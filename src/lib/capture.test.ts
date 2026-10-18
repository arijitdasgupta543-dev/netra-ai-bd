import { describe, expect, it } from 'vitest';
import { guideBox, pupilCropGeometry, pupilRoiGeometry, initialPupilCircle, circleConfirmed, readySince, shouldAutoCapture, validModelUrl, hintFor, checkPixels } from './capture';
describe('guided capture rules', () => {
  it('uses a centred 60% landscape 2:1 box', () => { const b=guideBox(1920,1080); expect(b.width).toBe(.6); expect(b.width*1920/(b.height*1080)).toBe(2); expect(b.x).toBe(.2); });
  it('creates a 448 tight masked ROI with side 2.2 times the radius', () => { const roi=pupilRoiGeometry(1000,600,{cx:.5,cy:.5,r:.1}); expect(roi.side).toBeCloseTo(220); expect(roi.sx).toBeCloseTo(390); expect(roi.sy).toBeCloseTo(190); expect(roi.size).toBe(448); expect(roi.radius).toBeCloseTo(448/2.2); });
  it('rejects oversized automatic circles and falls back to the small guide circle', () => { expect(initialPupilCircle({cx:.5,cy:.5,r:.3},guideBox(1920,1080),1080/1920)).toEqual({cx:.5,cy:.5,r:.065}); });
  it('requires explicit circle confirmation', () => { const circle={cx:.5,cy:.5,r:.065}; expect(circleConfirmed(circle,false)).toBe(false); expect(circleConfirmed(null,true)).toBe(false); expect(circleConfirmed(circle,true)).toBe(true); });
  it('retains unmasked model crop geometry at 224', () => { expect(pupilCropGeometry(1000,600,{cx:.5,cy:.5,r:.1},224).side).toBe(250); expect(pupilCropGeometry(1000,600,{cx:.5,cy:.5,r:.1},224).size).toBe(224); });
  it('auto captures only after one continuously ready second', () => { expect(shouldAutoCapture(10,1009)).toBe(false); expect(shouldAutoCapture(10,1010)).toBe(true); expect(readySince(10,false,900)).toBeNull(); expect(readySince(null,true,950)).toBe(950); });
  it('allows the default model and secure remote URLs only', () => { expect(validModelUrl('/model/model.json')).toBe(true); expect(validModelUrl('https://cdn.jsdelivr.net/gh/USER/netra-ai@main/web_model/model.json')).toBe(true); expect(validModelUrl('javascript:alert(1)')).toBe(false); });
  it('skips distance hints silently without an iris', () => { expect(hintFor({brightness:100,blur:80,contrast:30,glare:0,iris_found:false,iris_ratio:null,offset_x:null,offset_y:null})).toBe('ready'); });
  it('measures dark frames', () => { expect(checkPixels(new Uint8ClampedArray(16*16*4),16,16,{cx:.5,cy:.5,r:.1}).brightness).toBe(0); });
});