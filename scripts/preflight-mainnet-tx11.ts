import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TOKEN_ID = 1n;
export const UNSTAKE_AMOUNT = 10n;
export const SAFETY_GAS_LIMIT = 200000n;

async function preflightTx11() {
  console.log("=== MST Mainnet: Preflight for Transaction 11 (Account 3 Unstake 10 Units) ===");

  const connection = await network.connect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers } = connection as any;

  const normalizedAcc3 = getAddress(INVESTOR_ACCOUNT_3.toLowerCase());
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());

  const stakingContract = await ethers.getContractAt("PropertyTokenStaking", normalizedStaking);
  const propertyToken = await ethers.getContractAt("PropertyToken", normalizedPropertyToken);

  const [block, stakeRecord, acc3Balance, latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getBlock("latest"),
    stakingContract.getFunction("stakes")(TOKEN_ID, normalizedAcc3),
    ethers.provider.getBalance(normalizedAcc3),
    ethers.provider.getTransactionCount(normalizedAcc3, "latest"),
    ethers.provider.getTransactionCount(normalizedAcc3, "pending"),
  ]);

  if (!block) throw new Error("Could not fetch latest block");

  console.log(`Current Block Number:       ${block.number}`);
  console.log(`Current Block Timestamp:    ${block.timestamp} (${new Date(Number(block.timestamp) * 1000).toISOString()})`);
  console.log(`Account 3 Nonce:            latest=${latestNonce}, pending=${pendingNonce}`);
  console.log(`Account 3 Gas Balance:      ${formatEther(acc3Balance)} MST`);
  console.log(`Account 3 Staked Amount:    ${stakeRecord[0].toString()} Units (Required: >= 10)`);
  console.log(`Account 3 Lock End Time:    ${stakeRecord[1].toString()} (${new Date(Number(stakeRecord[1]) * 1000).toISOString()})`);

  const isLockExpired = BigInt(block.timestamp) >= stakeRecord[1];
  console.log(`Is Lock Expired:            ${isLockExpired ? "YES (READY TO UNSTAKE)" : "NO (LOCK ACTIVE)"}`);

  // Test unstake estimation or emergencyWithdraw estimation
  const unstakeData = stakingContract.interface.encodeFunctionData("unstake", [
    TOKEN_ID,
    UNSTAKE_AMOUNT,
  ]);

  let gasEstimate: bigint;
  try {
    gasEstimate = await ethers.provider.estimateGas({
      to: normalizedStaking,
      from: normalizedAcc3,
      data: unstakeData,
    });
    console.log(`Gas Estimation (unstake):   ${gasEstimate.toString()} units`);
  } catch (err: any) {
    console.warn(`[NOTICE] standard unstake estimation reverted: ${err.message}`);
    console.log(`Checking emergencyWithdraw estimation...`);
    const emData = stakingContract.interface.encodeFunctionData("emergencyWithdraw", [TOKEN_ID]);
    gasEstimate = await ethers.provider.estimateGas({
      to: normalizedStaking,
      from: normalizedAcc3,
      data: emData,
    });
    console.log(`Gas Estimation (emergencyWithdraw): ${gasEstimate.toString()} units`);
  }

  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxGasPrice = 2000000000n;

  const estimatedFee = gasEstimate * currentGasPrice;
  const maxFeeCap = SAFETY_GAS_LIMIT * maxGasPrice;

  console.log(`\nGas & Fee Analysis for Transaction 11:`);
  console.log(`   Estimated Gas Units:    ${gasEstimate.toString()}`);
  console.log(`   Safety Gas Limit:       ${SAFETY_GAS_LIMIT.toString()}`);
  console.log(`   Current Gas Price:      ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:          ${formatEther(estimatedFee)} MST`);
  console.log(`   Max Fee Cap (@ 2 gwei): ${formatEther(maxFeeCap)} MST`);

  const isSufficient = acc3Balance >= maxFeeCap;
  console.log(`   Account 3 Balance Sufficient: ${isSufficient ? "PASS" : "FAIL"}`);
}

preflightTx11().catch(console.error);
