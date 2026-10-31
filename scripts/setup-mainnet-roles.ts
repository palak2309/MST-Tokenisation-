import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const DEFAULT_PROPERTY_TOKEN_ADDRESS = "0x39985d784615f307D34B8143768a54bEEaB94537";
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";

/**
 * Normalizes and validates an EVM account address to its canonical EIP-55 checksum form.
 * If a mixed-case address with an invalid checksum is supplied, it normalizes from
 * the lowercase form using ethers v6 getAddress(), preventing "bad address checksum" halts.
 */
export function normalizeAccountAddress(rawAddress: string | undefined): string {
  if (!rawAddress || typeof rawAddress !== "string") {
    throw new Error("Address must be a non-empty string.");
  }
  const trimmed = rawAddress.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new Error("Address cannot be empty or the zero address.");
  }
  try {
    return getAddress(trimmed);
  } catch {
    // If the supplied mixed-case address has an invalid checksum, normalize from its lowercase form
    return getAddress(trimmed.toLowerCase());
  }
}

export const RAW_EXPECTED_ISSUER_ACCOUNT = "0x2889D4EF96b8F02Db90D7fEc0ea46E27f2Bd0471";
export const EXPECTED_ISSUER_ACCOUNT = normalizeAccountAddress(RAW_EXPECTED_ISSUER_ACCOUNT);

export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const ISSUER_ROLE_HASH =
  "0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122";
export const COMPLIANCE_ROLE_HASH =
  "0x442a94f1a1fac79af32856af2a64f63648cfa2ef3b98610a5bb7cbec4cee6985";
export const PAUSER_ROLE_HASH =
  "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a";

export const DEFAULT_FEE_BUFFER_PERCENT = 20n; // 20% safety margin for gas price volatility

export interface RoleGrantPlan {
  roleName: "COMPLIANCE_ROLE" | "PAUSER_ROLE" | "ISSUER_ROLE";
  roleHash: string;
  recipient: string;
  recipientLabel: string;
  confirmationPhrase: string;
  description: string;
}

export const ROLE_GRANT_PLANS: readonly RoleGrantPlan[] = [
  {
    roleName: "COMPLIANCE_ROLE",
    roleHash: COMPLIANCE_ROLE_HASH,
    recipient: EXPECTED_ADMIN_ACCOUNT,
    recipientLabel: "Account 1 (Admin & Compliance)",
    confirmationPhrase: "GRANT COMPLIANCE ROLE",
    description: "Enables investor KYC eligibility management and secondary transfer toggles.",
  },
  {
    roleName: "PAUSER_ROLE",
    roleHash: PAUSER_ROLE_HASH,
    recipient: EXPECTED_ADMIN_ACCOUNT,
    recipientLabel: "Account 1 (Admin & Emergency Pauser)",
    confirmationPhrase: "GRANT PAUSER ROLE",
    description: "Enables emergency pause and unpause circuit breaker for token actions.",
  },
  {
    roleName: "ISSUER_ROLE",
    roleHash: ISSUER_ROLE_HASH,
    recipient: EXPECTED_ISSUER_ACCOUNT,
    recipientLabel: "Account 2 (Authorized Property Issuer)",
    confirmationPhrase: "GRANT ISSUER ROLE",
    description: "Enables registering new property batches and issuing initial unit supplies.",
  },
] as const;

export function createRoleGrantPlans(
  issuerAddress: string = EXPECTED_ISSUER_ACCOUNT,
): readonly RoleGrantPlan[] {
  const normalizedIssuer = normalizeAccountAddress(issuerAddress);
  return [
    {
      roleName: "COMPLIANCE_ROLE",
      roleHash: COMPLIANCE_ROLE_HASH,
      recipient: EXPECTED_ADMIN_ACCOUNT,
      recipientLabel: "Account 1 (Admin & Compliance)",
      confirmationPhrase: "GRANT COMPLIANCE ROLE",
      description: "Enables investor KYC eligibility management and secondary transfer toggles.",
    },
    {
      roleName: "PAUSER_ROLE",
      roleHash: PAUSER_ROLE_HASH,
      recipient: EXPECTED_ADMIN_ACCOUNT,
      recipientLabel: "Account 1 (Admin & Emergency Pauser)",
      confirmationPhrase: "GRANT PAUSER ROLE",
      description: "Enables emergency pause and unpause circuit breaker for token actions.",
    },
    {
      roleName: "ISSUER_ROLE",
      roleHash: ISSUER_ROLE_HASH,
      recipient: normalizedIssuer,
      recipientLabel: "Account 2 (Authorized Property Issuer)",
      confirmationPhrase: "GRANT ISSUER ROLE",
      description: "Enables registering new property batches and issuing initial unit supplies.",
    },
  ];
}

export interface BalanceValidationResult {
  sufficient: boolean;
  estimatedCost: bigint;
  feeBuffer: bigint;
  requiredBalance: bigint;
  deficit: bigint;
}

export function calculateRequiredBalance(
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): { feeBuffer: bigint; requiredBalance: bigint } {
  if (estimatedCost < 0n) {
    throw new Error("Estimated cost cannot be negative.");
  }
  if (feeBufferPercent < 0n) {
    throw new Error("Fee buffer percentage cannot be negative.");
  }
  const feeBuffer = (estimatedCost * feeBufferPercent) / 100n;
  const requiredBalance = estimatedCost + feeBuffer;
  return { feeBuffer, requiredBalance };
}

export function validateGrantBalance(
  balance: bigint,
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): BalanceValidationResult {
  const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost, feeBufferPercent);

  if (balance < requiredBalance) {
    return {
      sufficient: false,
      estimatedCost,
      feeBuffer,
      requiredBalance,
      deficit: requiredBalance - balance,
    };
  }

  return {
    sufficient: true,
    estimatedCost,
    feeBuffer,
    requiredBalance,
    deficit: 0n,
  };
}

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

export function validateTokenAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed.toLowerCase() === zeroAddress.toLowerCase()) return false;
  if (!isAddressFn(trimmed)) return false;
  return trimmed.toLowerCase() === DEFAULT_PROPERTY_TOKEN_ADDRESS.toLowerCase();
}

export function validateAdminSigner(signerAddress: string): boolean {
  return signerAddress.toLowerCase() === EXPECTED_ADMIN_ACCOUNT.toLowerCase();
}

export function validateIssuerAccount(issuerAddress: string | undefined): boolean {
  if (!issuerAddress || typeof issuerAddress !== "string") return false;
  try {
    const normalized = normalizeAccountAddress(issuerAddress);
    return normalized.toLowerCase() === EXPECTED_ISSUER_ACCOUNT.toLowerCase();
  } catch {
    return false;
  }
}

export function assertNoAdminRoleForAccount2(roleHash: string, recipient: string): void {
  const normalizedRecipient = normalizeAccountAddress(recipient);
  const isAccount2 = normalizedRecipient.toLowerCase() === EXPECTED_ISSUER_ACCOUNT.toLowerCase();
  const isAdminRole = roleHash.toLowerCase() === DEFAULT_ADMIN_ROLE.toLowerCase();

  if (isAccount2 && isAdminRole) {
    throw new Error(
      "SECURITY VIOLATION: DEFAULT_ADMIN_ROLE cannot and must never be granted to Account 2.",
    );
  }

  // Strict invariant: This script is never permitted to grant DEFAULT_ADMIN_ROLE to any account
  if (isAdminRole) {
    throw new Error(
      "SECURITY VIOLATION: setup-mainnet-roles.ts is restricted from granting DEFAULT_ADMIN_ROLE.",
    );
  }
}

export function validateRoleConfirmation(expectedPhrase: string, input: string): boolean {
  return input.trim() === expectedPhrase.trim();
}

export function filterPendingGrants(
  plans: readonly RoleGrantPlan[],
  currentRoles: Record<string, boolean>,
): RoleGrantPlan[] {
  return plans.filter((plan) => !currentRoles[plan.roleName]);
}

export function normalizeScriptPath(filePath: string): string {
  try {
    return path.resolve(filePath).toLowerCase().replace(/\\/g, "/");
  } catch {
    return "";
  }
}

export function matchesScriptPath(arg: string, targetNormalized: string): boolean {
  if (!arg || typeof arg !== "string" || arg.startsWith("-")) {
    return false;
  }
  const normalizedArg = normalizeScriptPath(arg);
  if (!normalizedArg) return false;
  if (normalizedArg === targetNormalized) return true;
  if (`${normalizedArg}.ts` === targetNormalized || `${normalizedArg}.js` === targetNormalized) {
    return true;
  }
  return false;
}

export function isDirectExecution(
  importMetaUrl: string,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env["VITEST"] === "true" || env["HARDHAT_TEST"] === "true" || env["NODE_ENV"] === "test") {
    return false;
  }

  if (!importMetaUrl || !Array.isArray(argv) || argv.length < 2) {
    return false;
  }

  let targetPath: string;
  try {
    targetPath = fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }

  const targetNormalized = normalizeScriptPath(targetPath);
  if (!targetNormalized) {
    return false;
  }

  const directArg = argv[1];
  if (directArg && matchesScriptPath(directArg, targetNormalized)) {
    return true;
  }

  const isHardhatRunner = argv.some(
    (arg) => typeof arg === "string" && arg.toLowerCase().includes("hardhat"),
  );
  const isHardhatRunTask = argv.includes("run");

  if (isHardhatRunner) {
    return (
      isHardhatRunTask && argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized))
    );
  }

  return argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized));
}

export async function setupMainnetRoles() {
  console.log("=== MST Mainnet PropertyToken: Role Configuration Setup ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing role setup on unexpected Hardhat network "${networkName}". Expected "mstMainnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  // 1. Resolve and verify PropertyToken contract address
  const configuredAddress = (
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"] ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"] ||
    DEFAULT_PROPERTY_TOKEN_ADDRESS
  ).trim();

  if (!validateTokenAddress(configuredAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      `Invalid PropertyToken address: "${configuredAddress}".\n` +
        `Expected verified MST Mainnet contract address: ${DEFAULT_PROPERTY_TOKEN_ADDRESS}`,
    );
  }
  const tokenAddress = ethers.getAddress(configuredAddress);

  const bytecode = await ethers.provider.getCode(tokenAddress);
  if (bytecode === "0x") {
    throw new Error(
      `No contract bytecode found at ${tokenAddress} on MST Mainnet.\n` +
        "Ensure PropertyToken is deployed on MST Mainnet before configuring roles.",
    );
  }

  // 2. Resolve Admin Signer (Account 1)
  const [adminSigner] = await ethers.getSigners();
  if (!adminSigner) {
    throw new Error(
      "No signer available from configured MST_MAINNET_PRIVATE_KEY.\n" +
        "Please provide the private key for Account 1 in your local terminal session.",
    );
  }

  const adminAddress = await adminSigner.getAddress();
  if (!validateAdminSigner(adminAddress)) {
    throw new Error(
      `Signer address ${adminAddress} does not match expected Admin Account 1 (${EXPECTED_ADMIN_ACCOUNT}).\n` +
        "Only Account 1 can configure roles for this contract.",
    );
  }

  const adminBalance = BigInt(await ethers.provider.getBalance(adminAddress));

  // 2b. Resolve and normalize Account 2 (Issuer) address
  const rawIssuerAddress = (
    process.env["MST_MAINNET_ISSUER_ADDRESS"] ||
    process.env["VITE_MST_MAINNET_ISSUER_ADDRESS"] ||
    EXPECTED_ISSUER_ACCOUNT
  ).trim();

  let issuerAddress: string;
  try {
    issuerAddress = normalizeAccountAddress(rawIssuerAddress);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid configured Account 2 address "${rawIssuerAddress}": ${msg}`);
  }

  if (!validateIssuerAccount(issuerAddress)) {
    throw new Error(
      `Configured issuer address ${issuerAddress} does not match expected Account 2 (${EXPECTED_ISSUER_ACCOUNT}).\n` +
        "Only Account 2 can be granted ISSUER_ROLE.",
    );
  }

  console.log("\n--- Pre-Flight Configuration Verification ---");
  console.log("Network:                 MST Mainnet (Chain ID 4646)");
  console.log("PropertyToken Contract: ", tokenAddress);
  console.log("Admin Signer (Account 1):", adminAddress);
  console.log("Signer Native Balance:  ", ethers.formatEther(adminBalance), "MST");
  console.log("Issuer Account (Account 2):", issuerAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, adminSigner);
  const hasRoleFn = tokenContract.getFunction("hasRole");
  const grantRoleFn = tokenContract.getFunction("grantRole");

  // 3. Verify on-chain role hashes match compiled contract constants
  const onChainIssuerRole: string = await tokenContract.getFunction("ISSUER_ROLE")();
  const onChainComplianceRole: string = await tokenContract.getFunction("COMPLIANCE_ROLE")();
  const onChainPauserRole: string = await tokenContract.getFunction("PAUSER_ROLE")();

  if (
    onChainIssuerRole.toLowerCase() !== ISSUER_ROLE_HASH.toLowerCase() ||
    onChainComplianceRole.toLowerCase() !== COMPLIANCE_ROLE_HASH.toLowerCase() ||
    onChainPauserRole.toLowerCase() !== PAUSER_ROLE_HASH.toLowerCase()
  ) {
    throw new Error("On-chain role hash mismatch with compiled contract constants.");
  }
  console.log("✓ On-chain role hashes verified with deployed bytecode.");

  // 4. Verify Account 1 has DEFAULT_ADMIN_ROLE
  const hasAdminRole = await hasRoleFn(DEFAULT_ADMIN_ROLE, adminAddress);
  if (!hasAdminRole) {
    throw new Error(
      `Account 1 (${adminAddress}) does NOT hold DEFAULT_ADMIN_ROLE on PropertyToken at ${tokenAddress}.\n` +
        "Role configuration cannot proceed without admin authority.",
    );
  }
  console.log("✓ Account 1 verified as DEFAULT_ADMIN_ROLE holder on-chain.");

  // 5. Invariant check: Verify Account 2 does NOT have DEFAULT_ADMIN_ROLE
  const account2HasAdmin = await hasRoleFn(DEFAULT_ADMIN_ROLE, issuerAddress);
  if (account2HasAdmin) {
    throw new Error(
      `CRITICAL SECURITY WARNING: Account 2 (${issuerAddress}) unexpectedly holds DEFAULT_ADMIN_ROLE!`,
    );
  }
  console.log("✓ Invariant confirmed: Account 2 does not hold DEFAULT_ADMIN_ROLE.");

  // 6. Query current role assignments
  console.log("\n--- Checking Current Role Assignments ---");
  const currentRoles: Record<string, boolean> = {
    COMPLIANCE_ROLE: await hasRoleFn(COMPLIANCE_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT),
    PAUSER_ROLE: await hasRoleFn(PAUSER_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT),
    ISSUER_ROLE: await hasRoleFn(ISSUER_ROLE_HASH, issuerAddress),
  };

  console.log(
    `1. COMPLIANCE_ROLE -> Account 1: ${currentRoles["COMPLIANCE_ROLE"] ? "ALREADY GRANTED ✓ (will skip)" : "PENDING"}`,
  );
  console.log(
    `2. PAUSER_ROLE     -> Account 1: ${currentRoles["PAUSER_ROLE"] ? "ALREADY GRANTED ✓ (will skip)" : "PENDING"}`,
  );
  console.log(
    `3. ISSUER_ROLE     -> Account 2: ${currentRoles["ISSUER_ROLE"] ? "ALREADY GRANTED ✓ (will skip)" : "PENDING"}`,
  );

  const allPlans = createRoleGrantPlans(issuerAddress);
  const pendingGrants = filterPendingGrants(allPlans, currentRoles);

  if (pendingGrants.length === 0) {
    console.log("\n=============================================================");
    console.log("ALL REQUIRED ROLES ARE ALREADY CONFIGURED ON MST MAINNET!");
    console.log("- Account 1: DEFAULT_ADMIN_ROLE ✓, COMPLIANCE_ROLE ✓, PAUSER_ROLE ✓");
    console.log("- Account 2: ISSUER_ROLE ✓");
    console.log("0 transactions required. Exiting safely.");
    console.log("=============================================================");
    return;
  }

  console.log(`\nFound ${pendingGrants.length} role(s) requiring on-chain transaction.`);

  // 7. Estimate gas and verify deployer balance for pending transactions
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? 1_000_000_000n);

  let totalEstimatedCost = 0n;
  const gasEstimates: Map<string, bigint> = new Map();

  for (const plan of pendingGrants) {
    assertNoAdminRoleForAccount2(plan.roleHash, plan.recipient);
    const estimatedGas = BigInt(await grantRoleFn.estimateGas(plan.roleHash, plan.recipient));
    gasEstimates.set(plan.roleName, estimatedGas);
    totalEstimatedCost += estimatedGas * gasPrice;
  }

  const { feeBuffer, requiredBalance } = calculateRequiredBalance(
    totalEstimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  console.log("\n--- Batch Gas & Balance Estimation ---");
  console.log("Current Gas Price:       ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Total Estimated Cost:    ", ethers.formatEther(totalEstimatedCost), "MST");
  console.log(
    `Buffer (${DEFAULT_FEE_BUFFER_PERCENT.toString()}%):             `,
    ethers.formatEther(feeBuffer),
    "MST",
  );
  console.log("Total Required Balance:  ", ethers.formatEther(requiredBalance), "MST");
  console.log("Current Signer Balance:  ", ethers.formatEther(adminBalance), "MST");

  const balanceCheck = validateGrantBalance(
    adminBalance,
    totalEstimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );
  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient funds for role grant transactions on MST Mainnet.\n` +
        `  Signer balance:   ${ethers.formatEther(adminBalance)} MST\n` +
        `  Total required:   ${ethers.formatEther(requiredBalance)} MST\n` +
        `  Deficit:          ${ethers.formatEther(balanceCheck.deficit)} MST\n` +
        `Please fund admin account ${adminAddress} with at least ${ethers.formatEther(requiredBalance)} MST before proceeding.`,
    );
  }
  console.log("✓ Balance check passed: Signer has sufficient MST to complete all grants.");

  // 8. Execute each role grant with separate explicit confirmation phrase
  const terminal = createInterface({ input: stdin, output: stdout });

  try {
    for (const [index, plan] of pendingGrants.entries()) {
      const estimatedGas = gasEstimates.get(plan.roleName) ?? 60_000n;
      const txCost = estimatedGas * gasPrice;

      // Strict security invariant check before every single transaction
      assertNoAdminRoleForAccount2(plan.roleHash, plan.recipient);

      console.log(`\n=============================================================`);
      console.log(
        `TRANSACTION [${(index + 1).toString()}/${pendingGrants.length.toString()}]: GRANT ${plan.roleName}`,
      );
      console.log(`=============================================================`);
      console.log("Contract Target:   ", tokenAddress);
      console.log("Role to Grant:     ", plan.roleName);
      console.log("Role Hash:         ", plan.roleHash);
      console.log("Target Recipient:  ", plan.recipient);
      console.log("Recipient Role:    ", plan.recipientLabel);
      console.log("Purpose:           ", plan.description);
      console.log("Estimated Gas:     ", estimatedGas.toString(), "units");
      console.log("Estimated Fee:     ", ethers.formatEther(txCost), "MST");

      const confirmation = await terminal.question(
        `\nTo broadcast this transaction to MST Mainnet, type "${plan.confirmationPhrase}": `,
      );

      if (!validateRoleConfirmation(plan.confirmationPhrase, confirmation)) {
        throw new Error(
          `Transaction cancelled: input "${confirmation}" did not match required phrase "${plan.confirmationPhrase}". Aborting subsequent transactions.`,
        );
      }

      console.log(`Broadcasting grantRole(${plan.roleName}) transaction to MST Mainnet...`);
      const tx = await grantRoleFn(plan.roleHash, plan.recipient);
      console.log("Transaction Hash:", tx.hash);
      console.log("Waiting for block confirmation...");

      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`grantRole(${plan.roleName}) transaction failed or was reverted on-chain.`);
      }

      // Verify on-chain state immediately after mining
      const verified = await hasRoleFn(plan.roleHash, plan.recipient);
      if (!verified) {
        throw new Error(
          `Verification failed: transaction succeeded, but hasRole(${plan.roleName}, ${plan.recipient}) returned false!`,
        );
      }

      console.log(
        `✓ Confirmed on Mainnet! Block: ${receipt.blockNumber.toString()}, Gas Used: ${receipt.gasUsed.toString()}`,
      );
      console.log(
        `✓ Verification confirmed: hasRole(${plan.roleName}) is now TRUE for ${plan.recipient}`,
      );
    }
  } finally {
    terminal.close();
  }

  // 9. Final post-execution audit
  console.log("\n=============================================================");
  console.log("=== FINAL ROLE STATUS AUDIT (MST MAINNET) ===");
  console.log("=============================================================");
  const finalCompliance = await hasRoleFn(COMPLIANCE_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT);
  const finalPauser = await hasRoleFn(PAUSER_ROLE_HASH, EXPECTED_ADMIN_ACCOUNT);
  const finalIssuer = await hasRoleFn(ISSUER_ROLE_HASH, issuerAddress);
  const finalAccount2Admin = await hasRoleFn(DEFAULT_ADMIN_ROLE, issuerAddress);

  console.log(`Account 1 (${EXPECTED_ADMIN_ACCOUNT}):`);
  console.log(`  - DEFAULT_ADMIN_ROLE: true ✓`);
  console.log(`  - COMPLIANCE_ROLE:    ${finalCompliance ? "true ✓" : "FALSE ✗"}`);
  console.log(`  - PAUSER_ROLE:        ${finalPauser ? "true ✓" : "FALSE ✗"}`);
  console.log(`Account 2 (${issuerAddress}):`);
  console.log(`  - ISSUER_ROLE:        ${finalIssuer ? "true ✓" : "FALSE ✗"}`);
  console.log(
    `  - DEFAULT_ADMIN_ROLE: ${finalAccount2Admin ? "CRITICAL: TRUE ✗" : "false ✓ (Protected)"}`,
  );

  if (finalCompliance && finalPauser && finalIssuer && !finalAccount2Admin) {
    console.log("\nAll required MST Mainnet roles successfully verified!");
    console.log(`Contract: https://mstscan.com/address/${tokenAddress}`);
  } else {
    throw new Error("Final role audit did not meet required permission state.");
  }
}

if (isDirectExecution(import.meta.url)) {
  setupMainnetRoles().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected role setup error.";
    console.error("\n[ROLE SETUP HALTED]", message);
    process.exitCode = 1;
  });
}
