import { describe, expect, it } from "vitest";
import { folderFor, majority } from "./labels";

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
