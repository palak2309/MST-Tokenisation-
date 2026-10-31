import { describe, expect, it } from "vitest";
import { getAddress, id } from "ethers";
import {
  MAINNET_CHAIN_ID,
  DEFAULT_PROPERTY_TOKEN_ADDRESS,
  EXPECTED_ADMIN_ACCOUNT,
  EXPECTED_ISSUER_ACCOUNT,
  RAW_EXPECTED_ISSUER_ACCOUNT,
  DEFAULT_ADMIN_ROLE,
  ISSUER_ROLE_HASH,
  COMPLIANCE_ROLE_HASH,
  PAUSER_ROLE_HASH,
  ROLE_GRANT_PLANS,
  createRoleGrantPlans,
  normalizeAccountAddress,
  validateMainnetChainId,
  validateTokenAddress,
  validateAdminSigner,
  validateIssuerAccount,
  assertNoAdminRoleForAccount2,
  validateRoleConfirmation,
  filterPendingGrants,
  calculateRequiredBalance,
  validateGrantBalance,
  isDirectExecution,
} from "../../scripts/setup-mainnet-roles";

describe("MST Mainnet PropertyToken Role Setup Safeguards (setup-mainnet-roles.ts)", () => {
  const isMockAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  describe("1. Chain ID Validation", () => {
    it("accepts MST Mainnet chain ID 4646 strictly", () => {
      expect(MAINNET_CHAIN_ID).toBe(4646n);
      expect(validateMainnetChainId(4646n)).toBe(true);
    });

    it("rejects non-Mainnet chain IDs (including Testnet 91562037 and Ethereum 1)", () => {
      expect(validateMainnetChainId(91562037n)).toBe(false);
      expect(validateMainnetChainId(1n)).toBe(false);
      expect(validateMainnetChainId(137n)).toBe(false);
      expect(validateMainnetChainId(0n)).toBe(false);
    });
  });

  describe("2. Contract Address & Account Validation", () => {
    it("accepts the exact verified Mainnet PropertyToken contract address", () => {
      expect(validateTokenAddress(DEFAULT_PROPERTY_TOKEN_ADDRESS, isMockAddress, zeroAddress)).toBe(
        true,
      );
      expect(
        validateTokenAddress(
          DEFAULT_PROPERTY_TOKEN_ADDRESS.toLowerCase(),
          isMockAddress,
          zeroAddress,
        ),
      ).toBe(true);
    });

    it("rejects invalid, zero, or unverified contract addresses", () => {
      expect(validateTokenAddress(undefined, isMockAddress, zeroAddress)).toBe(false);
      expect(validateTokenAddress("", isMockAddress, zeroAddress)).toBe(false);
      expect(validateTokenAddress(zeroAddress, isMockAddress, zeroAddress)).toBe(false);
      expect(
        validateTokenAddress(
          "0x1111111111111111111111111111111111111111",
          isMockAddress,
          zeroAddress,
        ),
      ).toBe(false);
    });

    it("validates Admin Account 1 identity strictly", () => {
      expect(validateAdminSigner(EXPECTED_ADMIN_ACCOUNT)).toBe(true);
      expect(validateAdminSigner(EXPECTED_ADMIN_ACCOUNT.toLowerCase())).toBe(true);
      expect(validateAdminSigner(EXPECTED_ISSUER_ACCOUNT)).toBe(false);
      expect(validateAdminSigner("0x0000000000000000000000000000000000000000")).toBe(false);
    });

    it("validates Issuer Account 2 identity strictly", () => {
      expect(validateIssuerAccount(EXPECTED_ISSUER_ACCOUNT)).toBe(true);
      expect(validateIssuerAccount(EXPECTED_ISSUER_ACCOUNT.toLowerCase())).toBe(true);
      expect(validateIssuerAccount(RAW_EXPECTED_ISSUER_ACCOUNT)).toBe(true);
      expect(validateIssuerAccount(EXPECTED_ADMIN_ACCOUNT)).toBe(false);
      expect(validateIssuerAccount("0x0000000000000000000000000000000000000000")).toBe(false);
      expect(validateIssuerAccount(undefined)).toBe(false);
      expect(validateIssuerAccount("")).toBe(false);
    });

    it("normalizes Account 2 address from invalid mixed-case checksum to canonical EIP-55 format", () => {
      // 1. Direct getAddress() on raw mixed-case string throws bad address checksum
      expect(() => getAddress(RAW_EXPECTED_ISSUER_ACCOUNT)).toThrowError(/bad address checksum/i);

      // 2. normalizeAccountAddress recovers by computing EIP-55 checksum from lowercase
      const canonical = normalizeAccountAddress(RAW_EXPECTED_ISSUER_ACCOUNT);
      expect(canonical).toBe("0x2889D4EF96b8F02dB90D7fEc0ea46E27f2Bd0471");
      expect(EXPECTED_ISSUER_ACCOUNT).toBe("0x2889D4EF96b8F02dB90D7fEc0ea46E27f2Bd0471");

      // 3. Ethers getAddress() natively accepts the normalized canonical address
      expect(getAddress(canonical)).toBe(canonical);
      expect(getAddress(EXPECTED_ISSUER_ACCOUNT)).toBe(EXPECTED_ISSUER_ACCOUNT);

      // 4. Handles lowercase and uppercase inputs
      expect(normalizeAccountAddress(RAW_EXPECTED_ISSUER_ACCOUNT.toLowerCase())).toBe(canonical);
      expect(normalizeAccountAddress(RAW_EXPECTED_ISSUER_ACCOUNT.toUpperCase())).toBe(canonical);

      // 5. Preserves already valid checksum addresses (Account 1)
      expect(normalizeAccountAddress(EXPECTED_ADMIN_ACCOUNT)).toBe(EXPECTED_ADMIN_ACCOUNT);

      // 6. Strictly rejects zero address, empty strings, and invalid formats
      expect(() => normalizeAccountAddress(zeroAddress)).toThrow();
      expect(() => normalizeAccountAddress("")).toThrow();
      expect(() => normalizeAccountAddress(undefined)).toThrow();
      expect(() => normalizeAccountAddress("0x123")).toThrow();
      expect(() => normalizeAccountAddress("not-an-address")).toThrow();
    });
  });

  describe("3. Security Invariant: Never Grant DEFAULT_ADMIN_ROLE to Account 2", () => {
    it("throws a security violation when attempting to grant DEFAULT_ADMIN_ROLE to Account 2", () => {
      expect(() => {
        assertNoAdminRoleForAccount2(DEFAULT_ADMIN_ROLE, EXPECTED_ISSUER_ACCOUNT);
      }).toThrowError(/DEFAULT_ADMIN_ROLE cannot and must never be granted to Account 2/i);
    });

    it("throws a security violation for any attempt to grant DEFAULT_ADMIN_ROLE", () => {
      expect(() => {
        assertNoAdminRoleForAccount2(DEFAULT_ADMIN_ROLE, EXPECTED_ADMIN_ACCOUNT);
      }).toThrowError(/restricted from granting DEFAULT_ADMIN_ROLE/i);
    });

    it("permits authorized role grants to intended recipients", () => {
      expect(() => {
        assertNoAdminRoleForAccount2(COMPLIANCE_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT);
      }).not.toThrow();

      expect(() => {
        assertNoAdminRoleForAccount2(PAUSER_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT);
      }).not.toThrow();

      expect(() => {
        assertNoAdminRoleForAccount2(ISSUER_ROLE_HASH, EXPECTED_ISSUER_ACCOUNT);
      }).not.toThrow();
    });
  });

  describe("4. On-Chain Role Hashes & Role Plan Architecture", () => {
    it("verifies keccak256 role hashes match contract constants", () => {
      expect(ISSUER_ROLE_HASH).toBe(id("ISSUER_ROLE"));
      expect(COMPLIANCE_ROLE_HASH).toBe(id("COMPLIANCE_ROLE"));
      expect(PAUSER_ROLE_HASH).toBe(id("PAUSER_ROLE"));
      expect(DEFAULT_ADMIN_ROLE).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("configures exactly 3 role plans matching specification", () => {
      expect(ROLE_GRANT_PLANS).toHaveLength(3);

      const plan1 = ROLE_GRANT_PLANS[0]!;
      const plan2 = ROLE_GRANT_PLANS[1]!;
      const plan3 = ROLE_GRANT_PLANS[2]!;

      // Plan 1: COMPLIANCE_ROLE to Account 1
      expect(plan1.roleName).toBe("COMPLIANCE_ROLE");
      expect(plan1.recipient).toBe(EXPECTED_ADMIN_ACCOUNT);
      expect(plan1.confirmationPhrase).toBe("GRANT COMPLIANCE ROLE");

      // Plan 2: PAUSER_ROLE to Account 1
      expect(plan2.roleName).toBe("PAUSER_ROLE");
      expect(plan2.recipient).toBe(EXPECTED_ADMIN_ACCOUNT);
      expect(plan2.confirmationPhrase).toBe("GRANT PAUSER ROLE");

      // Plan 3: ISSUER_ROLE to Account 2
      expect(plan3.roleName).toBe("ISSUER_ROLE");
      expect(plan3.recipient).toBe(EXPECTED_ISSUER_ACCOUNT);
      expect(plan3.recipient).toBe("0x2889D4EF96b8F02dB90D7fEc0ea46E27f2Bd0471");
      expect(plan3.confirmationPhrase).toBe("GRANT ISSUER ROLE");
    });

    it("creates role grant plans with canonical checksummed recipient for Account 2", () => {
      const customPlans = createRoleGrantPlans(RAW_EXPECTED_ISSUER_ACCOUNT);
      expect(customPlans[2]!.recipient).toBe("0x2889D4EF96b8F02dB90D7fEc0ea46E27f2Bd0471");
      expect(getAddress(customPlans[2]!.recipient)).toBe(
        "0x2889D4EF96b8F02dB90D7fEc0ea46E27f2Bd0471",
      );
    });
  });

  describe("5. Role Skipping Logic (filterPendingGrants)", () => {
    it("queues all 3 plans when none are currently granted", () => {
      const current = {
        COMPLIANCE_ROLE: false,
        PAUSER_ROLE: false,
        ISSUER_ROLE: false,
      };
      const pending = filterPendingGrants(ROLE_GRANT_PLANS, current);
      expect(pending).toHaveLength(3);
    });

    it("skips roles that are already granted on-chain", () => {
      const current = {
        COMPLIANCE_ROLE: true,
        PAUSER_ROLE: false,
        ISSUER_ROLE: false,
      };
      const pending = filterPendingGrants(ROLE_GRANT_PLANS, current);
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.roleName)).toEqual(["PAUSER_ROLE", "ISSUER_ROLE"]);
    });

    it("returns empty array when all roles are already granted", () => {
      const current = {
        COMPLIANCE_ROLE: true,
        PAUSER_ROLE: true,
        ISSUER_ROLE: true,
      };
      const pending = filterPendingGrants(ROLE_GRANT_PLANS, current);
      expect(pending).toHaveLength(0);
    });
  });

  describe("6. Confirmation Phrase Validation", () => {
    it("accepts exact confirmation phrases", () => {
      expect(validateRoleConfirmation("GRANT COMPLIANCE ROLE", "GRANT COMPLIANCE ROLE")).toBe(true);
      expect(validateRoleConfirmation("GRANT PAUSER ROLE", "GRANT PAUSER ROLE")).toBe(true);
      expect(validateRoleConfirmation("GRANT ISSUER ROLE", "GRANT ISSUER ROLE")).toBe(true);
      expect(validateRoleConfirmation("GRANT ISSUER ROLE", "  GRANT ISSUER ROLE  ")).toBe(true);
    });

    it("rejects mismatched, lowercase, or incorrect phrases", () => {
      expect(validateRoleConfirmation("GRANT COMPLIANCE ROLE", "grant compliance role")).toBe(
        false,
      );
      expect(validateRoleConfirmation("GRANT COMPLIANCE ROLE", "YES")).toBe(false);
      expect(validateRoleConfirmation("GRANT PAUSER ROLE", "GRANT COMPLIANCE ROLE")).toBe(false);
      expect(validateRoleConfirmation("GRANT ISSUER ROLE", "")).toBe(false);
    });
  });

  describe("7. Gas & Balance Safeguards", () => {
    it("calculates 20% safety fee buffer correctly", () => {
      const { feeBuffer, requiredBalance } = calculateRequiredBalance(100_000n, 20n);
      expect(feeBuffer).toBe(20_000n);
      expect(requiredBalance).toBe(120_000n);
    });

    it("validates sufficient deployer balance", () => {
      const result = validateGrantBalance(150_000n, 100_000n, 20n);
      expect(result.sufficient).toBe(true);
      expect(result.deficit).toBe(0n);
    });

    it("flags deficit when balance is less than required", () => {
      const result = validateGrantBalance(100_000n, 100_000n, 20n);
      expect(result.sufficient).toBe(false);
      expect(result.deficit).toBe(20_000n);
    });
  });

  describe("8. Execution Guard", () => {
    it("prevents execution during test runs", () => {
      expect(
        isDirectExecution(import.meta.url, ["node", "setup-mainnet-roles.ts"], {
          VITEST: "true",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });
  });
});
