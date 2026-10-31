import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const EXPECTED_INVESTOR_ACCOUNT = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TX8_HASH = "0xca258151d689e87ade22212d94f1be554a009f6a7377b450e0b798348b3f974a";
export const TOKEN_ID = 1n;
export const SAFETY_GAS_LIMIT_T9 = 60000n;

async function verifyTx8AndPreflightTx9() {
  console.log("=== MST Mainnet: Verify Transaction 8 & Preflight Transaction 9 ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) throw new Error("Hardhat ethers plugin not loaded.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet")
    throw new Error(`Connected to ${networkName}, expected mstMainnet`);

  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const normalizedAcc3 = getAddress(EXPECTED_INVESTOR_ACCOUNT.toLowerCase());

  // PART 1: Verify Transaction 8
  console.log("\n--- Part 1: Verify Transaction 8 Receipt & On-Chain State ---");
  const [tx8, receipt8] = await Promise.all([
    ethers.provider.getTransaction(TX8_HASH),
    ethers.provider.getTransactionReceipt(TX8_HASH),
  ]);

  if (!tx8) throw new Error(`Transaction ${TX8_HASH} not found on MST Mainnet!`);
  if (!receipt8) throw new Error(`Transaction receipt for ${TX8_HASH} not available yet!`);

  console.log("Tx 8 Hash:           ", receipt8.hash);
  console.log("Receipt Status:      ", receipt8.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:        ", receipt8.blockNumber.toString());
  console.log("Gas Used:            ", receipt8.gasUsed.toString(), "units");
  console.log("Effective Gas Price: ", formatUnits(receipt8.gasPrice, "gwei"), "gwei");
  const fee8 = receipt8.gasUsed * receipt8.gasPrice;
  console.log("Actual Fee Paid:     ", formatEther(fee8), "MST");

  // Confirm Signer is Account 3
  const txFrom = getAddress(tx8.from.toLowerCase());
  console.log("Transaction Sender:  ", txFrom);
  console.log("Expected Account 3:  ", normalizedAcc3);
  const signerMatches = txFrom === normalizedAcc3;
  console.log("Signer Matches Acc 3:", signerMatches ? "YES (VERIFIED)" : "NO (ERROR)");
  if (!signerMatches) throw new Error("Sender does not match Account 3!");

  // Verify Token State on PropertyToken
  const propertyToken = await ethers.getContractAt("PropertyToken", normalizedPropertyToken);
  const [unitsBalance, totalSupply1, prop1] = await Promise.all([
    propertyToken.getFunction("balanceOf")(normalizedAcc3, TOKEN_ID),
    propertyToken.getFunction("totalSupply(uint256)")(TOKEN_ID),
    propertyToken.getFunction("getProperty")(TOKEN_ID),
  ]);

  console.log("\n--- On-Chain Property & Investor Balances ---");
  console.log(`Account 3 Units (Token #1): ${unitsBalance.toString()} Units (Expected: 10)`);
  console.log(`Token #1 Total Supply:      ${totalSupply1.toString()} Units`);
  console.log(`Token #1 Max Supply:        ${prop1.maxSupply.toString()} Units`);
  const remainingSupply = prop1.maxSupply - totalSupply1;
  console.log(`Token #1 Remaining Supply:   ${remainingSupply.toString()} Units`);

  if (unitsBalance !== 10n) {
    throw new Error(`balanceOf(Account3, 1) is ${unitsBalance}, expected 10!`);
  }

  // PART 2: Fresh Preflight for Transaction 9
  console.log("\n--- Part 2: Fresh Read-Only Preflight for Transaction 9 ---");
  const [acc3NativeBalance, acc3LatestNonce, acc3PendingNonce] = await Promise.all([
    ethers.provider.getBalance(normalizedAcc3),
    ethers.provider.getTransactionCount(normalizedAcc3, "latest"),
    ethers.provider.getTransactionCount(normalizedAcc3, "pending"),
  ]);

  console.log("Signer / Operator Grantor: ", normalizedAcc3, "(Account 3)");
  console.log("Native Gas Balance:        ", formatEther(acc3NativeBalance), "MST");
  console.log("Account 3 Latest Nonce:    ", acc3LatestNonce);
  console.log("Account 3 Pending Nonce:   ", acc3PendingNonce);

  // Check Current Approval State
  const currentApproval = await propertyToken.getFunction("isApprovedForAll")(
    normalizedAcc3,
    normalizedStaking,
  );
  console.log(`isApprovedForAll(Account3, Staking): ${currentApproval} (Expected: false)`);

  // Simulate Gas for setApprovalForAll(stakingContract, true) from Account 3
  const approveData = propertyToken.interface.encodeFunctionData("setApprovalForAll", [
    normalizedStaking,
    true,
  ]);
  const gasEstimateT9 = await ethers.provider.estimateGas({
    to: normalizedPropertyToken,
    from: normalizedAcc3,
    data: approveData,
  });

  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxGasPrice = 2000000000n; // 2 gwei max cap

  const estimatedFeeT9 = gasEstimateT9 * currentGasPrice;
  const feeAtSafetyLimitT9 = SAFETY_GAS_LIMIT_T9 * currentGasPrice;
  const maxFeeCapT9 = SAFETY_GAS_LIMIT_T9 * maxGasPrice;

  console.log(`\nGas & Fee Analysis for Transaction 9:`);
  console.log(`   Estimated Gas Units:    ${gasEstimateT9.toString()}`);
  console.log(`   Safety Gas Limit:       ${SAFETY_GAS_LIMIT_T9.toString()}`);
  console.log(`   Current Gas Price:      ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:          ${formatEther(estimatedFeeT9)} MST`);
  console.log(`   Fee at Safety Limit:    ${formatEther(feeAtSafetyLimitT9)} MST`);
  console.log(`   Max Fee Cap (@ 2 gwei): ${formatEther(maxFeeCapT9)} MST`);

  const hasSufficientBalance = acc3NativeBalance >= maxFeeCapT9;
  console.log(`   Account 3 Balance Sufficient: ${hasSufficientBalance ? "PASS" : "FAIL"}`);

  console.log("\n=== VERIFICATION AND PREFLIGHT COMPLETE ===");
}

verifyTx8AndPreflightTx9().catch((err) => {
  console.error("Verification/Preflight Error:", err);
  process.exitCode = 1;
});
