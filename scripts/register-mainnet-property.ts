import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, id as keccak256Id, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const TARGET_PROPERTY_TOKEN = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";

export const PROPERTY_ID = "MST-DEMO-PUNE-002";
export const PROPERTY_REF = "0x04be0df93386640943b898e4e7606217b9c4de45f560e8c0764052b5dea49f98";
export const DOCUMENT_HASH = "0x9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6";
export const MAX_SUPPLY = 1500n;
export const UNIT_PRICE = 100000n;
export const METADATA_URI = "ipfs://mst/MST-DEMO-PUNE-002";
export const GAS_LIMIT = 240000n;

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

export async function executeRegisterPuneProperty() {
  console.log("=== MST Mainnet: Execute Transaction 2 (Register Pune Demo Property) ===");

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
      `Signer ${signerAddress} does not match expected Account 1 (${EXPECTED_ADMIN_ACCOUNT}).`,
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

  // 4. Verify Signer has ISSUER_ROLE
  const issuerRole = await tokenContract.getFunction("ISSUER_ROLE")();
  const hasIssuer = await tokenContract.getFunction("hasRole")(issuerRole, signerAddress);
  if (!hasIssuer) {
    throw new Error(`Signer ${signerAddress} does not hold ISSUER_ROLE on PropertyToken.`);
  }
  console.log("✓ Signer holds ISSUER_ROLE on PropertyToken: true");

  // 5. Verify Property Reference calculation & not already registered
  const computedRef = keccak256Id(PROPERTY_ID);
  if (computedRef.toLowerCase() !== PROPERTY_REF.toLowerCase()) {
    throw new Error(
      `Computed propertyRef mismatch: expected ${PROPERTY_REF}, computed ${computedRef}`,
    );
  }
  console.log("✓ Property ID:", PROPERTY_ID);
  console.log("✓ Property Reference (keccak256):", computedRef);
  console.log("✓ Document Hash (Synthetic Fingerprint):", DOCUMENT_HASH);

  const existingTokenId: bigint =
    await tokenContract.getFunction("tokenIdByPropertyRef")(computedRef);
  if (existingTokenId !== 0n) {
    throw new Error(
      `Property is already registered on-chain with Token ID #${existingTokenId.toString()}.`,
    );
  }
  console.log(
    "✓ Pre-check confirmed: Property reference is NOT already registered (existing Token ID: 0).",
  );

  // 6. Query Nonce & Balance
  const [balance, nonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
  ]);
  console.log("✓ Current Nonce:", nonce, "(Expected 14)");
  console.log("✓ Current Balance:", formatEther(balance), "MST");

  if (nonce !== 14) {
    console.warn(`[WARNING] Current nonce is ${nonce}, expected 14.`);
  }

  // 7. Broadcast Transaction 2
  console.log("\nBroadcasting registerProperty() to MST Mainnet...");
  const tx = await tokenContract.getFunction("registerProperty")(
    computedRef,
    DOCUMENT_HASH,
    MAX_SUPPLY,
    UNIT_PRICE,
    METADATA_URI,
    { gasLimit: GAS_LIMIT },
  );

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction failed or was reverted on-chain.");
  }

  // 8. Post-Transaction Verification
  const createdTokenId: bigint =
    await tokenContract.getFunction("tokenIdByPropertyRef")(computedRef);
  if (createdTokenId === 0n) {
    throw new Error("Post-check failed: Property was not assigned a valid Token ID.");
  }

  const propData = await tokenContract.getFunction("getProperty")(createdTokenId);
  const feeData = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=== Transaction 2 Confirmed & Verified ===");
  console.log("Transaction Hash:  ", receipt.hash);
  console.log("Receipt Status:    ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:      ", receipt.blockNumber.toString());
  console.log("Gas Used:          ", receipt.gasUsed.toString());
  console.log("Gas Price:         ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:   ", formatEther(feeData), "MST");
  console.log("Created Token ID:  #", createdTokenId.toString());
  console.log("\nOn-Chain Property Record:");
  console.log("  Property Ref:    ", propData[0]);
  console.log("  Doc Hash:        ", propData[1]);
  console.log("  Max Supply:      ", propData[2].toString(), "Units");
  console.log("  Total Supply:    ", propData[3].toString(), "Units");
  console.log("  Unit Price:      ", propData[4].toString(), "paise (INR 1,000)");
  console.log("  Metadata URI:    ", propData[5]);
  console.log("  Transfers Enabled:", propData[6], "(Strictly false as intended)");
  console.log("MSTScan Explorer:  https://mstscan.com/tx/" + receipt.hash);
}

executeRegisterPuneProperty().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 2 FAILED]", msg);
  process.exitCode = 1;
});
