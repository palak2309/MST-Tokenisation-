import { describe, expect, it, vi } from "vitest";
import {
  BRIDGEKEY_RDNS,
  compareOnChainFingerprint,
  discoverBridgeKeyProvider,
  parseContractError,
  ROLES,
  subscribeToBridgeKeyEvents,
  type BridgeKeyProviderEvents,
} from "./blockchain";
import type { Eip1193Provider } from "ethers";

function providerAnnouncement(rdns: string, provider: Eip1193Provider) {
  return new CustomEvent("eip6963:announceProvider", {
    detail: {
      info: {
        name: rdns === BRIDGEKEY_RDNS ? "BridgeKey" : "Other Wallet",
        icon: "",
        rdns,
        uuid: crypto.randomUUID(),
      },
      provider,
    },
  });
}

describe("blockchain helpers", () => {
  describe("on-chain fingerprint comparison", () => {
    const candidate = "a".repeat(64);
    const reference = "b".repeat(64);

    it("matches identical valid fingerprints when the relevant record exists", () => {
      expect(compareOnChainFingerprint(candidate, candidate, true, true)).toBe("Match");
    });

    it("matches an identical registered reference case-insensitively", () => {
      expect(compareOnChainFingerprint(`0x${candidate.toUpperCase()}`, candidate, true, true)).toBe(
        "Match",
      );
    });

    it("reports mismatch when a different registered reference exists", () => {
      expect(compareOnChainFingerprint(candidate, reference, false, true)).toBe("Mismatch");
    });

    it("does not match a different uploaded fingerprint just because it is registered", () => {
      expect(compareOnChainFingerprint(candidate, reference, true, false)).toBe(
        "No Registered Reference",
      );
    });

    it("does not claim a match when neither fingerprint has a registry record", () => {
      expect(compareOnChainFingerprint(candidate, reference, false, false)).toBe(
        "No Registered Reference",
      );
    });

    it("does not match when no reference fingerprint is available", () => {
      expect(compareOnChainFingerprint(candidate, "", true, false)).toBe("No Registered Reference");
    });

    it("rejects fingerprints that are not valid SHA-256 hex", () => {
      expect(() => compareOnChainFingerprint("abc", reference, true, true)).toThrow(
        "Invalid SHA-256 fingerprint",
      );
    });
  });

  describe("BridgeKey EIP-6963 discovery", () => {
    it("selects only the provider announced with BridgeKey's exact RDNS", async () => {
      const bridgeKey = { request: vi.fn() } as unknown as Eip1193Provider;
      const otherWallet = { request: vi.fn() } as unknown as Eip1193Provider;
      const announceWallets = () => {
        window.dispatchEvent(providerAnnouncement("io.other.wallet", otherWallet));
        window.dispatchEvent(providerAnnouncement(BRIDGEKEY_RDNS, bridgeKey));
      };
      window.addEventListener("eip6963:requestProvider", announceWallets);

      try {
        await expect(discoverBridgeKeyProvider(50)).resolves.toBe(bridgeKey);
      } finally {
        window.removeEventListener("eip6963:requestProvider", announceWallets);
      }
    });

    it("reports missing BridgeKey instead of using window.ethereum", async () => {
      const fallbackWallet = { request: vi.fn() };
      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: fallbackWallet,
      });

      try {
        await expect(discoverBridgeKeyProvider(10)).rejects.toThrow("BridgeKey was not detected");
        expect(fallbackWallet.request).not.toHaveBeenCalled();
      } finally {
        delete (window as Window & { ethereum?: unknown }).ethereum;
      }
    });

    it("ignores repeated BridgeKey announcements after selecting the provider", async () => {
      const bridgeKey = { request: vi.fn() } as unknown as Eip1193Provider;
      const announceWallets = () => {
        window.dispatchEvent(providerAnnouncement(BRIDGEKEY_RDNS, bridgeKey));
        window.dispatchEvent(providerAnnouncement(BRIDGEKEY_RDNS, bridgeKey));
      };
      window.addEventListener("eip6963:requestProvider", announceWallets);

      try {
        await expect(discoverBridgeKeyProvider(50)).resolves.toBe(bridgeKey);
      } finally {
        window.removeEventListener("eip6963:requestProvider", announceWallets);
      }
    });
  });

  describe("BridgeKey event subscriptions", () => {
    it("subscribes to accountsChanged, chainChanged and disconnect, returning an unsubscribe cleanup", () => {
      const listeners = new Map<string, (...args: unknown[]) => void>();
      const provider = {
        request: vi.fn(),
        on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          listeners.set(event, listener);
        }),
        removeListener: vi.fn((event: string) => {
          listeners.delete(event);
        }),
      } as unknown as Parameters<typeof subscribeToBridgeKeyEvents>[0];
      const handlers: BridgeKeyProviderEvents = {
        accountsChanged: vi.fn(),
        chainChanged: vi.fn(),
        disconnect: vi.fn(),
      };

      const unsubscribe = subscribeToBridgeKeyEvents(provider, handlers);
      listeners.get("accountsChanged")?.(["0x1234"]);
      listeners.get("chainChanged")?.(["0x5752035"]);
      listeners.get("disconnect")?.([]);

      expect(handlers.accountsChanged).toHaveBeenCalledWith(["0x1234"]);
      expect(handlers.chainChanged).toHaveBeenCalledWith("0x5752035");
      expect(handlers.disconnect).toHaveBeenCalledOnce();

      unsubscribe();
      expect(listeners.size).toBe(0);
      expect(provider.removeListener).toHaveBeenCalledTimes(3);
    });
  });

  describe("PropertyToken error decoding & configuration", () => {
    it("decodes IneligibleInvestor error into human-readable advice", () => {
      const error = { message: "execution reverted: custom error IneligibleInvestor(0x123)" };
      expect(parseContractError(error)).toContain("approved eligible investor");
    });

    it("decodes SupplyCapExceeded error into supply cap notice", () => {
      const error = { message: "execution reverted: custom error SupplyCapExceeded(1, 100, 50)" };
      expect(parseContractError(error)).toContain("exceeds the remaining maximum supply cap");
    });

    it("decodes AccessControlUnauthorizedAccount into unauthorized notice", () => {
      const error = { message: "execution reverted: AccessControlUnauthorizedAccount" };
      expect(parseContractError(error)).toContain(
        "Unauthorized: Connected wallet does not have the required role",
      );
    });

    it("decodes TransfersDisabled error", () => {
      const error = { message: "execution reverted: TransfersDisabled(1)" };
      expect(parseContractError(error)).toContain("Transfers are currently disabled");
    });

    it("exposes correctly computed role hashes matching Solidity keccak256", () => {
      expect(ROLES.DEFAULT_ADMIN_ROLE).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
      expect(ROLES.ISSUER_ROLE).toBe(
        "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122",
      );
      expect(ROLES.COMPLIANCE_ROLE).toBe(
        "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985",
      );
      expect(ROLES.PAUSER_ROLE).toBe(
        "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a",
      );
    });
  });
});
