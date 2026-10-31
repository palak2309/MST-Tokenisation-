import { describe, it, expect } from "vitest";

describe("Module initialization order and circular dependency prevention", () => {
  it("imports sampleProperties cleanly without dependencies", async () => {
    const sampleMod = await import("@/lib/sampleProperties");
    expect(sampleMod.PROPERTIES).toBeDefined();
    expect(sampleMod.PROPERTIES.length).toBeGreaterThanOrEqual(3);
    expect(sampleMod.DEFAULT_PROPERTY.id).toBe("PRP-PUN-0142");
  });

  it("imports propertyStore directly first without Cannot access 'PROPERTIES' before initialization", async () => {
    const storeMod = await import("@/lib/propertyStore");
    expect(storeMod.getAllProperties).toBeDefined();
    const props = storeMod.getAllProperties();
    expect(props.length).toBeGreaterThanOrEqual(3);
    expect(props[0]?.id).toBeDefined();
  });

  it("imports data.ts directly without TDZ or circular dependency error", async () => {
    const dataMod = await import("@/lib/data");
    expect(dataMod.PROPERTIES).toBeDefined();
    expect(dataMod.PROPERTIES.length).toBeGreaterThanOrEqual(3);
    expect(dataMod.getProperty("PRP-PUN-0142")).toBeDefined();
    expect(dataMod.getProperty("PRP-PUN-0142")?.name).toContain("Sample Residency");
  });

  it("imports routes/index without initialization errors", async () => {
    // Index route imports both data and propertyStore
    const indexMod = await import("@/routes/index");
    expect(indexMod).toBeDefined();
  });
});
