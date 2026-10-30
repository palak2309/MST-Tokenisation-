import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BRIDGEKEY_RDNS,
  chainConfig,
  compareOnChainFingerprint,
  discoverBridgeKeyProvider,
  getExpectedChainId,
  getRegistryConfigurationMessage,
  getTokenRegistryConfigurationMessage,
  grantRoleOnChain,
  hasRoleOnChain,
  isLiveConfigured,
  isTokenLiveConfigured,
  MAINNET_CHAIN_ID_NUM,
  parseContractError,
  ROLES,
  subscribeToBridgeKeyEvents,
  switchWalletNetwork,
  TESTNET_ADMIN_ACCOUNT,
  MAINNET_ADMIN_ACCOUNT,
  ADMIN_ACCOUNT,
  TESTNET_CHAIN_ID_NUM,
  type BridgeKeyProviderEvents,
} from "./blockchain";
import { setActiveNetwork } from "../contractConfig";
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

    it("decodes InvalidPropertyRef error into human-readable advice", () => {
      const error = { message: "execution reverted: custom error InvalidPropertyRef()" };
      expect(parseContractError(error)).toContain("property ID cannot be empty");
    });

    it("decodes InvalidDocumentHash error into human-readable advice", () => {
      const error = { message: "execution reverted: custom error InvalidDocumentHash()" };
      expect(parseContractError(error)).toContain("document fingerprint cannot be zero");
    });

    it("decodes InvalidMaxSupply error into human-readable advice", () => {
      const error = { message: "execution reverted: custom error InvalidMaxSupply()" };
      expect(parseContractError(error)).toContain("maximum token supply must be greater than zero");
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

  describe("dual network configuration and guards", () => {
    beforeEach(() => {
      setActiveNetwork("testnet");
    });

    it("defaults to MST Testnet (Chain ID 91562037)", () => {
      expect(chainConfig.network).toBe("testnet");
      expect(chainConfig.chainId).toBe("91562037");
      expect(getExpectedChainId()).toBe(91562037n);
    });

    it("dynamically reflects network switch to Mainnet (Chain ID 4646)", () => {
      setActiveNetwork("mainnet");
      expect(chainConfig.network).toBe("mainnet");
      expect(chainConfig.chainId).toBe("4646");
      expect(getExpectedChainId()).toBe(4646n);

      // And dynamically switches back to Testnet
      setActiveNetwork("testnet");
      expect(chainConfig.network).toBe("testnet");
      expect(chainConfig.chainId).toBe("91562037");
      expect(getExpectedChainId()).toBe(91562037n);
    });

    it("disables live actions and provides clear explanation when Mainnet addresses are missing", () => {
      setActiveNetwork("mainnet");
      // Mainnet does not inherit testnet contract addresses
      expect(chainConfig.contractAddress).toBeUndefined();
      expect(chainConfig.tokenContractAddress).toBeUndefined();
      expect(isLiveConfigured()).toBe(false);
      expect(isTokenLiveConfigured()).toBe(false);

      const registryMsg = getRegistryConfigurationMessage();
      expect(registryMsg).toContain("Mainnet contract not deployed/configured");
      expect(registryMsg).toContain("VITE_MST_MAINNET_CONTRACT_ADDRESS");

      const tokenMsg = getTokenRegistryConfigurationMessage();
      expect(tokenMsg).toContain("Mainnet PropertyToken contract not deployed/configured");
      expect(tokenMsg).toContain("VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS");
    });
  });

  describe("grantRoleOnChain and multi-network safeguards", () => {
    it("exports verified admin address and chain IDs", () => {
      expect(TESTNET_ADMIN_ACCOUNT).toBe("0xEF9fE181ed6659096895bb54f71487B67E3b262b");
      expect(MAINNET_ADMIN_ACCOUNT).toBe("0xEF9fE181ed6659096895bb54f71487B67E3b262b");
      expect(ADMIN_ACCOUNT).toBe("0xEF9fE181ed6659096895bb54f71487B67E3b262b");
      expect(TESTNET_CHAIN_ID_NUM).toBe(91562037n);
      expect(MAINNET_CHAIN_ID_NUM).toBe(4646n);
      expect(ROLES.COMPLIANCE_ROLE).toBe(
        "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985",
      );
      expect(ROLES.DEFAULT_ADMIN_ROLE).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("rejects grantRoleOnChain when active network token contract is unconfigured", async () => {
      setActiveNetwork("mainnet");
      await expect(grantRoleOnChain(ROLES.COMPLIANCE_ROLE, TESTNET_ADMIN_ACCOUNT)).rejects.toThrow(
        /Mainnet PropertyToken contract not deployed\/configured/i,
      );
      setActiveNetwork("testnet");
    });

    it("returns false from hasRoleOnChain when inputs or token addresses are missing", async () => {
      expect(await hasRoleOnChain("", "")).toBe(false);
      expect(await hasRoleOnChain(ROLES.COMPLIANCE_ROLE, "")).toBe(false);
      setActiveNetwork("mainnet");
      expect(await hasRoleOnChain(ROLES.COMPLIANCE_ROLE, TESTNET_ADMIN_ACCOUNT)).toBe(false);
      setActiveNetwork("testnet");
    });

    it("enforces Testnet chain ID 91562037 when granting role on Testnet", async () => {
      setActiveNetwork("testnet");
      const mockEth = {
        request: vi.fn(async ({ method }) => {
          if (method === "eth_requestAccounts") return [TESTNET_ADMIN_ACCOUNT];
          if (method === "eth_chainId") return "0x1226"; // 4646 (Mainnet)
          return null;
        }),
      } as unknown as Eip1193Provider;

      const announce = () => {
        window.dispatchEvent(providerAnnouncement(BRIDGEKEY_RDNS, mockEth));
      };
      window.addEventListener("eip6963:requestProvider", announce);

      try {
        await expect(
          grantRoleOnChain(ROLES.COMPLIANCE_ROLE, TESTNET_ADMIN_ACCOUNT),
        ).rejects.toThrow(/Expected: 91562037 \(MST Testnet\)/i);
      } finally {
        window.removeEventListener("eip6963:requestProvider", announce);
      }
    });

    it("enforces Mainnet chain ID 4646 when granting role on Mainnet", async () => {
      import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS =
        "0x39985d784615f307D34B8143768a54bEEaB94537";
      process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS =
        "0x39985d784615f307D34B8143768a54bEEaB94537";
      setActiveNetwork("mainnet");

      const mockEth = {
        request: vi.fn(async ({ method }) => {
          if (method === "eth_requestAccounts") return [MAINNET_ADMIN_ACCOUNT];
          if (method === "eth_chainId") return "0x5752035"; // 91562037 (Testnet)
          return null;
        }),
      } as unknown as Eip1193Provider;

      const announce = () => {
        window.dispatchEvent(providerAnnouncement(BRIDGEKEY_RDNS, mockEth));
      };
      window.addEventListener("eip6963:requestProvider", announce);

      try {
        await expect(
          grantRoleOnChain(ROLES.COMPLIANCE_ROLE, MAINNET_ADMIN_ACCOUNT),
        ).rejects.toThrow(/Expected: 4646 \(MST Mainnet\)/i);
      } finally {
        window.removeEventListener("eip6963:requestProvider", announce);
        import.meta.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = "";
        process.env.VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS = "";
        setActiveNetwork("testnet");
      }
    });
  });

  describe("switchWalletNetwork EIP-3326 and EIP-3085 support", () => {
    it("requests wallet_switchEthereumChain with hex chain ID", async () => {
      const mockRequest = vi.fn().mockResolvedValue(null);
      const mockProvider = { request: mockRequest } as unknown as Eip1193Provider;

      await switchWalletNetwork("mainnet", mockProvider);
      expect(mockRequest).toHaveBeenCalledWith({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1226" }],
      });

      await switchWalletNetwork("testnet", mockProvider);
      expect(mockRequest).toHaveBeenCalledWith({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x5752035" }],
      });
    });

    it("falls back to wallet_addEthereumChain on error 4902 (unrecognized chain)", async () => {
      const mockRequest = vi
        .fn()
        .mockRejectedValueOnce({ code: 4902, message: "Unrecognized chain ID" })
        .mockResolvedValueOnce(null);
      const mockProvider = { request: mockRequest } as unknown as Eip1193Provider;

      await switchWalletNetwork("mainnet", mockProvider);
      expect(mockRequest).toHaveBeenNthCalledWith(1, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1226" }],
      });
      expect(mockRequest).toHaveBeenNthCalledWith(2, {
        method: "wallet_addEthereumChain",
        params: [
          expect.objectContaining({
            chainId: "0x1226",
            chainName: "MST Mainnet",
            nativeCurrency: { name: "MST", symbol: "MST", decimals: 18 },
            rpcUrls: ["https://mariorpc.mstblockchain.com/"],
            blockExplorerUrls: ["https://mstscan.com/"],
          }),
        ],
      });
    });

    it("re-throws error when user rejects switch (code 4001)", async () => {
      const mockRequest = vi.fn().mockRejectedValue({ code: 4001, message: "User rejected" });
      const mockProvider = { request: mockRequest } as unknown as Eip1193Provider;

      await expect(switchWalletNetwork("mainnet", mockProvider)).rejects.toEqual({
        code: 4001,
        message: "User rejected",
      });
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });
});
