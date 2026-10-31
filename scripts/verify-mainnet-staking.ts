import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const DEFAULT_DEMO_TOKEN_ID = 1n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const EXPECTED_INVESTOR_ACCOUNT = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";

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

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

export function parseTokenId(
  rawTokenId: string | undefined,
  defaultTokenId: bigint = DEFAULT_DEMO_TOKEN_ID,
): bigint {
  if (!rawTokenId || rawTokenId.trim() === "") {
    return defaultTokenId;
  }
  const trimmed = rawTokenId.trim();
  try {
    const val = BigInt(trimmed);
    if (val <= 0n) throw new Error("Token ID must be a positive integer.");
    return val;
  } catch (e) {
    if (e instanceof Error && e.message.includes("positive integer")) throw e;
    throw new Error(`Invalid token ID "${trimmed}". Must be a valid positive integer.`);
  }
}

async function main() {
  console.log("=== MST Mainnet Staking Layer On-Chain Verification ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing verification on unexpected network "${networkName}". Expected "mstMainnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  const rawTokenAddress =
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim();
  const rawStakingAddress =
    process.env["MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !rawStakingAddress) {
    throw new Error(
      "Both MST_MAINNET_TOKEN_CONTRACT_ADDRESS and MST_MAINNET_STAKING_CONTRACT_ADDRESS are required.",
    );
  }

  const tokenAddress = normalizeAccountAddress(rawTokenAddress);
  const stakingAddress = normalizeAccountAddress(rawStakingAddress);
  const adminAddress = normalizeAccountAddress(
    process.env["MST_MAINNET_ADMIN_ADDRESS"]?.trim() || EXPECTED_ADMIN_ACCOUNT,
  );
  const investorAddress = normalizeAccountAddress(
    process.env["MST_MAINNET_INVESTOR_ADDRESS"]?.trim() || EXPECTED_INVESTOR_ACCOUNT,
  );
  const tokenId = parseTokenId(process.env["MST_MAINNET_TOKEN_ID"]);

  console.log("\n--- Verification Target Parameters ---");
  console.log("Network:                 MST Mainnet (Chain ID 4646)");
  console.log("PropertyToken Contract: ", tokenAddress);
  console.log("Staking Contract:       ", stakingAddress);
  console.log("Admin Account 1:        ", adminAddress);
  console.log("Investor Account 3:     ", investorAddress);
  console.log("Token ID:               #", tokenId.toString());

  // 1. Verify Contract Bytecode
  const [tokenCode, stakingCode] = await Promise.all([
    ethers.provider.getCode(tokenAddress),
    ethers.provider.getCode(stakingAddress),
  ]);

  if (tokenCode === "0x") throw new Error(`No bytecode at PropertyToken address: ${tokenAddress}`);
  if (stakingCode === "0x")
    throw new Error(`No bytecode at Staking contract address: ${stakingAddress}`);
  console.log(
    "✓ Contract Bytecode Verified: Both PropertyToken and Staking contracts are deployed.",
  );

  const tokenContract = await ethers.getContractAt("PropertyToken", tokenAddress);
  const stakingContract = await ethers.getContractAt("PropertyTokenStaking", stakingAddress);

  // 2. Immutability & Interfaces
  const underlyingToken: string = await stakingContract.getFunction("propertyToken")();
  if (underlyingToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(
      `Staking underlying token mismatch! Expected ${tokenAddress}, got ${underlyingToken}`,
    );
  }
  console.log(
    "✓ Staking Contract Immuntability: Pointing directly to PropertyToken:",
    underlyingToken,
  );

  // 3. Property Configuration & Transfer Restrictions
  const prop = await tokenContract.getFunction("getProperty")(tokenId);
  console.log("\n--- Property Details ---");
  console.log("Property Reference Hash:", prop[0]);
  console.log("Document SHA-256 Hash:  ", prop[1]);
  console.log("Max Unit Supply:        ", prop[2].toString());
  console.log("Unit Price Ref (paise): ", prop[3].toString());
  console.log("Metadata URI:           ", prop[4]);
  console.log("Transfers Enabled:      ", prop[6]);

  if (prop[6] === true) {
    console.warn(
      "⚠️ WARNING: Ordinary transfersEnabled is TRUE! Path B expects transfersEnabled to be FALSE.",
    );
  } else {
    console.log(
      "✓ Ordinary transfersEnabled is FALSE (Investor-to-investor transfers safely blocked).",
    );
  }

  // 4. Staking Transfer Exemption Authorization
  const [stakingEligible, stakingAuthorized] = await Promise.all([
    tokenContract.getFunction("isEligibleInvestor")(stakingAddress),
    tokenContract.getFunction("isAuthorizedStakingContract")(stakingAddress),
  ]);

  console.log("\n--- Staking Compliance Authorization ---");
  console.log("Staking Contract Whitelisted:     ", stakingEligible ? "YES ✓" : "NO ✗");
  console.log("Staking Transfer Exemption Active:", stakingAuthorized ? "YES ✓" : "NO ✗");

  if (!stakingEligible || !stakingAuthorized) {
    throw new Error("Staking contract is NOT fully authorized on PropertyToken!");
  }

  // 5. Investor Account 3 Status
  const [investorEligible, investorBalance, isApproved, stakeRecord] = await Promise.all([
    tokenContract.getFunction("isEligibleInvestor")(investorAddress),
    tokenContract.getFunction("balanceOf")(investorAddress, tokenId),
    tokenContract.getFunction("isApprovedForAll")(investorAddress, stakingAddress),
    stakingContract.getFunction("getStakeInfo")(tokenId, investorAddress),
  ]);

  console.log("\n--- Investor Account 3 Status ---");
  console.log("Investor KYC Whitelisted:        ", investorEligible ? "YES ✓" : "NO ✗");
  console.log("Wallet Available Balance:        ", investorBalance.toString(), "Units");
  console.log("Operator Approval For Staking:   ", isApproved ? "APPROVED ✓" : "NOT APPROVED ✗");
  console.log("Staked Units in Vault:           ", stakeRecord.amount.toString(), "Units");
  console.log(
    "Lock Status:                     ",
    stakeRecord.isLocked ? "LOCKED" : "UNLOCKED / FLEXIBLE ✓",
  );

  // 6. Staking Pool State
  const [poolConfig, poolState, custodyBalance] = await Promise.all([
    stakingContract.getFunction("poolConfigs")(tokenId),
    stakingContract.getFunction("poolStates")(tokenId),
    tokenContract.getFunction("balanceOf")(stakingAddress, tokenId),
  ]);

  console.log("\n--- Staking Pool State ---");
  console.log("Pool Enabled:                    ", poolConfig[2] ? "YES ✓" : "NO ✗");
  console.log("Pool Min Lock Duration:          ", poolConfig[0].toString(), "seconds");
  console.log("Pool Max Lock Duration:          ", poolConfig[1].toString(), "seconds");
  console.log("Total Staked (Pool Accounting):  ", poolState.totalStaked.toString(), "Units");
  console.log("Total Custody (Token BalanceOf): ", custodyBalance.toString(), "Units");

  if (poolState.totalStaked !== custodyBalance) {
    console.warn("⚠️ Pool totalStaked does not match contract token balance!");
  } else {
    console.log("✓ Staking pool accounting perfectly matches ERC-1155 custody balance.");
  }

  console.log("\n=== Mainnet Staking Verification Complete ===");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected verification error.";
  console.error("\n[VERIFICATION FAILED]", message);
  process.exitCode = 1;
});
