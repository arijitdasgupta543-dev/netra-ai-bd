import { describe, expect, it } from "vitest";
import { folderFor, majority, guessPhoneModel, detectPhoneModel } from "./labels";

describe("consensus label", () => {
  it("picks majority", () => {
    expect(majority(["normal", "normal", "other"])).toBe("normal");
  });
  it("returns null on tie", () => {
    expect(majority(["normal", "other"])).toBeNull();
  });
  it("groups early and advanced cataract into cataract folder", () => {
    expect(folderFor(["cataract_early", "cataract_advanced", "normal"])).toBe("cataract");
  });
  it("unreviewed goes to unlabelled", () => {
    expect(folderFor([])).toBe("unlabelled");
  });
});

describe('phone model detection', () => {
  it('does not display Android reduced user-agent placeholder K', () => { expect(guessPhoneModel('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36')).toBe('Android'); });
  it('prefers the high-entropy model', async () => { expect(await detectPhoneModel({userAgent:'Android 10; K)',userAgentData:{getHighEntropyValues:async hints=>{expect(hints).toEqual(['model']);return {model:'SM-A525F'};}}})).toBe('SM-A525F'); });
  it('falls back safely when high-entropy access is denied', async () => { expect(await detectPhoneModel({userAgent:'Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A)',userAgentData:{getHighEntropyValues:async()=>{throw new Error('denied');}}})).toBe('SM-A525F'); });
});
