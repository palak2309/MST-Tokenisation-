import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const TARGET_PROPERTY_TOKEN = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const GAS_LIMIT = 70000n;

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

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
    return getAddress(trimmed.toLowerCase());
  }
}

export async function executeGrantIssuerToAdmin() {
  console.log("=== MST Mainnet: Execute Transaction 1 (Grant ISSUER_ROLE to Account 1) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing execution on unexpected network "${networkName}". Expected "mstMainnet".`,
    );
  }

  // 1. Verify Network Chain ID
  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `Network Chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }
  console.log("✓ Network verified: MST Mainnet (Chain ID 4646)");

  // 2. Verify Signer
  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== EXPECTED_ADMIN_ACCOUNT.toLowerCase()) {
    throw new Error(
      `Signer ${signerAddress} does not match expected Admin Account 1 (${EXPECTED_ADMIN_ACCOUNT}).`,
    );
  }
  console.log("✓ Signer verified:", signerAddress);

  // 3. Verify Target Contract
  const tokenAddress = normalizeAccountAddress(TARGET_PROPERTY_TOKEN);
  const code = await ethers.provider.getCode(tokenAddress);
  if (code === "0x") {
    throw new Error(`No bytecode found at target PropertyToken address ${tokenAddress}.`);
  }
  console.log("✓ Contract verified:", tokenAddress);

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress, signer);

  // 4. Verify Roles & Pre-Conditions
  const issuerRole = await tokenContract.getFunction("ISSUER_ROLE")();
  const defaultAdminRole = await tokenContract.getFunction("DEFAULT_ADMIN_ROLE")();

  const [isAdmin, hasIssuerAlready] = await Promise.all([
    tokenContract.getFunction("hasRole")(defaultAdminRole, signerAddress),
    tokenContract.getFunction("hasRole")(issuerRole, signerAddress),
  ]);

  if (!isAdmin) {
    throw new Error(`Signer ${signerAddress} does not hold DEFAULT_ADMIN_ROLE on PropertyToken.`);
  }
  console.log("✓ Signer holds DEFAULT_ADMIN_ROLE on PropertyToken: true");

  if (hasIssuerAlready) {
    console.log("Notice: Account 1 already holds ISSUER_ROLE on-chain. No transaction needed.");
    return;
  }
  console.log("✓ Pre-check confirmed: Account 1 does NOT currently hold ISSUER_ROLE.");

  // 5. Query Nonce & Balance
  const [balance, nonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
  ]);
  console.log("✓ Current Nonce:", nonce);
  console.log("✓ Current Balance:", formatEther(balance), "MST");

  // 6. Broadcast Transaction 1
  console.log("\nBroadcasting grantRole(ISSUER_ROLE, Account 1) to MST Mainnet...");
  const tx = await tokenContract.getFunction("grantRole")(issuerRole, signerAddress, {
    gasLimit: GAS_LIMIT,
  });

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed or was reverted on-chain.");
  }

  // 7. Post-Transaction Verification
  const hasIssuerPost = await tokenContract.getFunction("hasRole")(issuerRole, signerAddress);
  if (!hasIssuerPost) {
    throw new Error(
      "Post-check failed: hasRole(ISSUER_ROLE, Account 1) is still false after confirmation.",
    );
  }

  const feeData = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=== Transaction 1 Confirmed & Verified ===");
  console.log("Transaction Hash: ", receipt.hash);
  console.log("Receipt Status:   ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:     ", receipt.blockNumber.toString());
  console.log("Gas Used:         ", receipt.gasUsed.toString());
  console.log("Gas Price:        ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:  ", formatEther(feeData), "MST");
  console.log("Post-Check Role:   hasRole(ISSUER_ROLE, Account 1) ==", hasIssuerPost);
  console.log("MSTScan Explorer:  https://mstscan.com/tx/" + receipt.hash);
}

executeGrantIssuerToAdmin().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 1 FAILED]", msg);
  process.exitCode = 1;
});
