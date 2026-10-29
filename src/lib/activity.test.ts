import { describe, expect, it } from "vitest";
import { addActivity, separateActivityRecords, type ActivityRecord } from "./activity";

describe("separateActivityRecords", () => {
  it("strictly separates on-chain confirmed transactions from local simulated events", () => {
    const mixedRecords: ActivityRecord[] = [
      {
        id: "1",
        time: "2026-10-20T10:00:00Z",
        kind: "Fingerprint registered",
        propertyId: "PRP-PUN-0142",
        detail: "Real confirmed transaction",
        source: "onchain",
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        explorerUrl: "https://testnet.mstscan.com/tx/0xabcdef",
      },
      {
        id: "2",
        time: "2026-10-21T10:00:00Z",
        kind: "Contribution",
        propertyId: "PRP-MUM-0087",
        detail: "Hypothetical contribution of ₹2,50,000",
        source: "demo",
        txHash: "DEMO-0002",
      },
      {
        id: "3",
        time: "2026-10-22T10:00:00Z",
        kind: "Document hashed",
        propertyId: "PRP-NSK-0219",
        detail: "Document hashed locally",
        source: "demo",
      },
    ];

    const { confirmedOnChain, localSimulated } = separateActivityRecords(mixedRecords);

    expect(confirmedOnChain).toHaveLength(1);
    expect(confirmedOnChain[0]?.source).toBe("onchain");
    expect(confirmedOnChain[0]?.txHash).toMatch(/^0x/);

    expect(localSimulated).toHaveLength(2);
    expect(localSimulated.every((r) => r.source === "demo")).toBe(true);
    expect(localSimulated.some((r) => r.txHash === "DEMO-0002")).toBe(true);
  });

  it("returns empty confirmed on-chain list when only simulated records exist", () => {
    const demoOnly: ActivityRecord[] = [
      {
        id: "d1",
        time: "2026-10-20T10:00:00Z",
        kind: "Contribution",
        propertyId: "PRP-PUN-0142",
        detail: "Simulated",
        source: "demo",
      },
    ];

    const { confirmedOnChain, localSimulated } = separateActivityRecords(demoOnly);
    expect(confirmedOnChain).toHaveLength(0);
    expect(localSimulated).toHaveLength(1);
  });

  it("labels newly added demo records with source 'demo' and prefix 'DEMO-'", () => {
    const rec = addActivity({
      kind: "Contribution",
      propertyId: "PRP-TEST",
      detail: "Testing demo contribution",
      source: "demo",
    });

    expect(rec.source).toBe("demo");
    expect(rec.txHash).toMatch(/^DEMO-\d{4}$/);
  });
});
