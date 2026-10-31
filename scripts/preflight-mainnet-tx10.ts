import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TOKEN_ID = 1n;
export const STAKE_AMOUNT = 10n;
export const LOCK_DURATION = 0n; // 0 seconds flexible lock
export const SAFETY_GAS_LIMIT = 200000n;

async function preflightTx10() {
  console.log("=== MST Mainnet: Preflight for Transaction 10 (Account 3 Stake 10 Units) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) throw new Error("Hardhat ethers plugin not loaded.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet")
    throw new Error(`Connected to ${networkName}, expected mstMainnet`);

  const normalizedAcc3 = getAddress(INVESTOR_ACCOUNT_3.toLowerCase());
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());

  const propertyToken = await ethers.getContractAt("PropertyToken", normalizedPropertyToken);
  const stakingContract = await ethers.getContractAt("PropertyTokenStaking", normalizedStaking);

  // 1. Account 3 Identity, Balance, Nonce
  const [nativeBalance, latestNonce, pendingNonce, blockNumber] = await Promise.all([
    ethers.provider.getBalance(normalizedAcc3),
    ethers.provider.getTransactionCount(normalizedAcc3, "latest"),
    ethers.provider.getTransactionCount(normalizedAcc3, "pending"),
    ethers.provider.getBlockNumber(),
  ]);

  console.log(`\n1. Signer / Staker: ${normalizedAcc3} (Account 3)`);
  console.log(`   Current Block:   ${blockNumber}`);
  console.log(`   Native Gas Bal:  ${formatEther(nativeBalance)} MST`);
  console.log(`   Latest Nonce:    ${latestNonce} (Expected: 2)`);
  console.log(`   Pending Nonce:   ${pendingNonce}`);

  // 2. Token Balance and Operator Approval Checks
  const [unitsBalance, isApproved, isEligible, poolConfig] = await Promise.all([
    propertyToken.getFunction("balanceOf")(normalizedAcc3, TOKEN_ID),
    propertyToken.getFunction("isApprovedForAll")(normalizedAcc3, normalizedStaking),
    propertyToken.getFunction("isEligibleInvestor")(normalizedAcc3),
    stakingContract.getFunction("poolConfigs")(TOKEN_ID),
  ]);

  console.log(`\n2. Staking Prerequisites Check:`);
  console.log(
    `   Account 3 Token Units Balance: ${unitsBalance.toString()} Units (Required: >= 10)`,
  );
  console.log(`   Staking Operator Approved:     ${isApproved} (Confirmed from Tx 9)`);
  console.log(`   Investor Eligible:             ${isEligible} (Confirmed from Tx 7)`);
  console.log(`   Pool #1 Active:                ${poolConfig[2]} (Confirmed from Tx 6)`);
  console.log(`   Pool Min Lock Duration:        ${poolConfig[0].toString()} seconds`);
  console.log(`   Pool Max Lock Duration:        ${poolConfig[1].toString()} seconds`);

  if (unitsBalance < STAKE_AMOUNT) throw new Error("Insufficient units balance to stake 10 units!");
  if (!isApproved) throw new Error("Staking contract is not approved by Account 3!");
  if (!poolConfig[2]) throw new Error("Staking pool is not enabled!");

  // 3. Simulate Gas for stake(1, 10, 0) from Account 3
  const stakeData = stakingContract.interface.encodeFunctionData("stake", [
    TOKEN_ID,
    STAKE_AMOUNT,
    LOCK_DURATION,
  ]);
  const gasEstimate = await ethers.provider.estimateGas({
    to: normalizedStaking,
    from: normalizedAcc3,
    data: stakeData,
  });

  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxGasPrice = 2000000000n; // 2 gwei max cap

  const estimatedFee = gasEstimate * currentGasPrice;
  const feeAtSafetyLimit = SAFETY_GAS_LIMIT * currentGasPrice;
  const maxFeeCap = SAFETY_GAS_LIMIT * maxGasPrice;

  console.log(`\n3. Gas & Fee Economics for Transaction 10:`);
  console.log(`   Estimated Gas Units:    ${gasEstimate.toString()}`);
  console.log(`   Safety Gas Limit:       ${SAFETY_GAS_LIMIT.toString()}`);
  console.log(`   Current Gas Price:      ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:          ${formatEther(estimatedFee)} MST`);
  console.log(`   Fee at Safety Limit:    ${formatEther(feeAtSafetyLimit)} MST`);
  console.log(`   Max Fee Cap (@ 2 gwei): ${formatEther(maxFeeCap)} MST`);

  const hasSufficient = nativeBalance >= maxFeeCap;
  console.log(`   Account 3 Balance Sufficient: ${hasSufficient ? "PASS" : "FAIL"}`);

  console.log(`\n=== PREFLIGHT COMPLETE: READY FOR APPROVAL ===`);
}

preflightTx10().catch((err) => {
  console.error("Preflight Error:", err);
  process.exitCode = 1;
});
