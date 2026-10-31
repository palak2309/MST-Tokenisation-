import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54F71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const TOKEN_ID = 1n;
export const MIN_LOCK_DURATION = 0n; // 0 seconds (flexible lock for demo)
export const MAX_LOCK_DURATION = 31536000n; // 365 days
export const POOL_ENABLED = true;
export const SAFETY_GAS_LIMIT = 60000n;

async function preflightTx6() {
  console.log("=== MST Mainnet: Preflight for Transaction 6 (Configure Staking Pool #1) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) throw new Error("Hardhat ethers plugin not loaded.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet")
    throw new Error(`Connected to ${networkName}, expected mstMainnet`);

  // 1. Confirm Chain ID & RPC
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId;
  const rpcUrl = process.env["MST_MAINNET_RPC_URL"] || "https://mariorpc.mstblockchain.com/";
  console.log(`\n1. Chain ID: ${chainId.toString()} (Expected: ${MAINNET_CHAIN_ID.toString()})`);
  console.log(`   Configured RPC: ${rpcUrl}`);
  if (chainId !== MAINNET_CHAIN_ID)
    throw new Error(`Chain ID mismatch: ${chainId} != ${MAINNET_CHAIN_ID}`);

  // 2. Refresh Signer & Balances
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer found.");
  const signerAddress = getAddress(await signer.getAddress());
  const normalizedExpected = getAddress(EXPECTED_ADMIN_ACCOUNT.toLowerCase());
  if (signerAddress !== normalizedExpected) {
    throw new Error(`Signer address ${signerAddress} != expected ${normalizedExpected}`);
  }

  const [balance, latestNonce, pendingNonce, blockNumber] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
    ethers.provider.getTransactionCount(signerAddress, "pending"),
    ethers.provider.getBlockNumber(),
  ]);

  console.log(`\n2. Signer / Gas Payer: ${signerAddress}`);
  console.log(`   Current Block Number: ${blockNumber}`);
  console.log(`   Native Balance: ${formatEther(balance)} MST`);
  console.log(`   Latest Nonce: ${latestNonce}`);
  console.log(`   Pending Nonce: ${pendingNonce}`);

  // 3. Verify Staking Contract on Mainnet
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const stakingCode = await ethers.provider.getCode(normalizedStaking);
  const stakingExists = stakingCode !== "0x" && stakingCode.length > 2;
  console.log(`\n3. Staking Contract Address: ${normalizedStaking}`);
  console.log(`   Staking Contract Bytecode Length: ${stakingCode.length} characters`);
  console.log(`   Staking Contract Exists: ${stakingExists ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!stakingExists) throw new Error("Staking contract does not exist!");

  // 4. Verify Signer Admin Role on Staking Contract
  const stakingContract = await ethers.getContractAt(
    "PropertyTokenStaking",
    normalizedStaking,
    signer,
  );
  const defaultAdminRole = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const hasAdmin = await stakingContract.getFunction("hasRole")(defaultAdminRole, signerAddress);
  console.log(`\n4. Staking Contract Admin Role Check:`);
  console.log(`   DEFAULT_ADMIN_ROLE: ${defaultAdminRole}`);
  console.log(`   Signer Has DEFAULT_ADMIN_ROLE: ${hasAdmin ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!hasAdmin) throw new Error("Signer lacks DEFAULT_ADMIN_ROLE on PropertyTokenStaking!");

  // 5. Query Current Pool Configuration for Token ID 1
  const currentPoolConfig = await stakingContract.getFunction("poolConfigs")(TOKEN_ID);
  console.log(`\n5. Current Pool Configuration for Token ID #${TOKEN_ID}:`);
  console.log(`   minLockDuration: ${currentPoolConfig[0].toString()} seconds`);
  console.log(`   maxLockDuration: ${currentPoolConfig[1].toString()} seconds`);
  console.log(`   isEnabled:       ${currentPoolConfig[2]}`);

  // 6. Gas Estimation & Fee Analysis
  const gasEstimate = await stakingContract
    .getFunction("configurePool")
    .estimateGas(TOKEN_ID, MIN_LOCK_DURATION, MAX_LOCK_DURATION, POOL_ENABLED);
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxGasPrice = 2000000000n; // 2 gwei max cap

  const estimatedFee = gasEstimate * currentGasPrice;
  const feeAtSafetyLimit = SAFETY_GAS_LIMIT * currentGasPrice;
  const maxFeeCap = SAFETY_GAS_LIMIT * maxGasPrice;

  console.log(`\n6. Gas & Fee Analysis:`);
  console.log(`   Estimated Gas Units:    ${gasEstimate.toString()}`);
  console.log(`   Safety Gas Limit:       ${SAFETY_GAS_LIMIT.toString()}`);
  console.log(`   Current Gas Price:      ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:          ${formatEther(estimatedFee)} MST`);
  console.log(`   Fee at Safety Limit:    ${formatEther(feeAtSafetyLimit)} MST`);
  console.log(`   Max Fee Cap (@ 2 gwei): ${formatEther(maxFeeCap)} MST`);

  // 7. Balance Sufficiency Check
  const isSufficient = balance >= maxFeeCap;
  console.log(`\n7. Balance Sufficiency Check:`);
  console.log(`   Required Max Fee:  ${formatEther(maxFeeCap)} MST`);
  console.log(`   Available Balance: ${formatEther(balance)} MST`);
  console.log(`   Sufficient:        ${isSufficient ? "PASS" : "FAIL"}`);

  console.log(`\n=== PREFLIGHT COMPLETE: READY FOR APPROVAL ===`);
}

preflightTx6().catch((err) => {
  console.error("Preflight Error:", err);
  process.exitCode = 1;
});
