import { describe, expect, it } from "vitest";
import { compareOnChainFingerprint } from "./blockchain";

describe("on-chain fingerprint comparison", () => {
  it("matches when the uploaded fingerprint is registered for the property", () => {
    expect(compareOnChainFingerprint("abc", "def", true, true)).toBe("Match");
  });

  it("matches an identical registered reference case-insensitively", () => {
    expect(compareOnChainFingerprint("0xABCD", "0xabcd", false, true)).toBe("Match");
  });

  it("reports mismatch when a different registered reference exists", () => {
    expect(compareOnChainFingerprint("abc", "def", false, true)).toBe("Mismatch");
  });

  it("does not claim a match when neither fingerprint has a registry record", () => {
    expect(compareOnChainFingerprint("abc", "def", false, false)).toBe("No Registered Reference");
  });
});
