import { describe, expect, it } from "vitest";
import { parseDevices } from "./devices";

const device = {
  id: 1,
  name: "Kitchen",
  can_complete_tasks: false,
  expires_at: 1800000000,
  revoked_at: null,
};
describe("display response normalization", () => {
  it("defaults missing, null and malformed preferences without crashing settings", () => {
    for (const preferences of [
      undefined,
      null,
      "bad",
      {},
      { home_view: "invalid", theme: "invalid" },
    ]) {
      expect(parseDevices([{ ...device, preferences }])[0].preferences).toEqual(
        { home_view: "today", theme: "system" },
      );
    }
  });
  it("preserves supported display preferences", () => {
    expect(
      parseDevices([
        { ...device, preferences: { home_view: "week", theme: "dark" } },
      ])[0].preferences,
    ).toEqual({ home_view: "week", theme: "dark" });
  });
  it("rejects malformed entries before render", () => {
    for (const value of [
      null,
      {},
      [null],
      [{ ...device, id: "1" }],
      [{ ...device, expires_at: Infinity }],
    ]) {
      expect(() => parseDevices(value)).toThrow();
    }
  });
});
