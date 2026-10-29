import { describe, expect, it } from "vitest";
import { ALLOWED_TYPES, MAX_BYTES, sha256Hex } from "./blockchain";

describe("document hashing and validation", () => {
  it("enforces allowed document file types", () => {
    expect(ALLOWED_TYPES).toContain("application/pdf");
    expect(ALLOWED_TYPES).toContain("image/png");
    expect(ALLOWED_TYPES).toContain("image/jpeg");
    expect(ALLOWED_TYPES).toContain("image/webp");

    const isAllowed = (mime: string) => ALLOWED_TYPES.includes(mime);
    expect(isAllowed("application/pdf")).toBe(true);
    expect(isAllowed("image/png")).toBe(true);
    expect(isAllowed("image/jpeg")).toBe(true);
    expect(isAllowed("image/webp")).toBe(true);
    expect(isAllowed("application/x-executable")).toBe(false);
    expect(isAllowed("application/zip")).toBe(false);
    expect(isAllowed("text/plain")).toBe(false);
  });

  it("enforces maximum file size limit of 10 MB", () => {
    expect(MAX_BYTES).toBe(10 * 1024 * 1024);
    const isUnderLimit = (bytes: number) => bytes <= MAX_BYTES;
    expect(isUnderLimit(1024)).toBe(true);
    expect(isUnderLimit(10 * 1024 * 1024)).toBe(true);
    expect(isUnderLimit(10 * 1024 * 1024 + 1)).toBe(false);
  });

  it("calculates SHA-256 hex correctly for real file content using Web Crypto", async () => {
    const text = "MST Property Sale Deed 2026";
    const file = new File([text], "deed.pdf", { type: "application/pdf" });
    const hash = await sha256Hex(file);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // Predictable reference check: same content gives identical hash
    const file2 = new File([text], "copy_deed.pdf", { type: "application/pdf" });
    const hash2 = await sha256Hex(file2);
    expect(hash).toBe(hash2);

    // Different content gives different hash
    const file3 = new File(["Different content"], "other.pdf", { type: "application/pdf" });
    const hash3 = await sha256Hex(file3);
    expect(hash).not.toBe(hash3);
  });
});
