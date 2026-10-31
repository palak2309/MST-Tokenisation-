import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54F71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const TOKEN_ID = 1n;
export const MIN_LOCK_DURATION = 0n;
export const MAX_LOCK_DURATION = 31536000n;
export const POOL_ENABLED = true;
export const EXPECTED_NONCE = 18;
export const SAFETY_GAS_LIMIT = 60000n;
export const MAX_FEE_CAP_WEI = 120000000000000n; // 0.000120 MST (60,000 * 2 gwei)

export async function executeTx6() {
  console.log("=== MST Mainnet: Execute Transaction 6 (Configure Staking Pool #1) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) throw new Error("Hardhat ethers plugin not loaded.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet") throw new Error(`Refusing execution on "${networkName}"`);

  // 1. Verify Network
  const actualNetwork = await ethers.provider.getNetwork();
  if (actualNetwork.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Chain ID mismatch: ${actualNetwork.chainId} != ${MAINNET_CHAIN_ID}`);
  }

  // 2. Verify Signer
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer found.");
  const signerAddress = getAddress(await signer.getAddress());
  const expectedAdmin = getAddress(EXPECTED_ADMIN_ACCOUNT.toLowerCase());
  if (signerAddress !== expectedAdmin) {
    throw new Error(`Signer ${signerAddress} != ${expectedAdmin}`);
  }

  // 3. Verify Nonce & Balance
  const [balance, latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
    ethers.provider.getTransactionCount(signerAddress, "pending"),
  ]);

  console.log(`✓ Nonce check: latest=${latestNonce}, pending=${pendingNonce}`);
  if (latestNonce !== EXPECTED_NONCE) {
    throw new Error(`Nonce mismatch: latest=${latestNonce}, expected ${EXPECTED_NONCE}`);
  }
  if (pendingNonce !== latestNonce) {
    throw new Error(`Pending nonce mismatch: pending=${pendingNonce} != latest=${latestNonce}`);
  }

  // 4. Verify Admin Role on Staking Contract
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const stakingContract = await ethers.getContractAt(
    "PropertyTokenStaking",
    normalizedStaking,
    signer,
  );
  const defaultAdminRole = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const hasAdmin = await stakingContract.getFunction("hasRole")(defaultAdminRole, signerAddress);
  if (!hasAdmin) throw new Error("Signer lacks DEFAULT_ADMIN_ROLE on PropertyTokenStaking");

  // 5. Gas & Fee Check
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxFee = SAFETY_GAS_LIMIT * currentGasPrice;
  if (maxFee > MAX_FEE_CAP_WEI) throw new Error("Max fee exceeds cap!");
  if (balance < maxFee) throw new Error("Insufficient balance!");

  // 6. Broadcast Transaction 6
  console.log(
    `\n>>> Broadcasting Transaction 6: configurePool(tokenId: 1, min: 0, max: 31536000, enabled: true) <<<`,
  );
  const tx = await stakingContract.getFunction("configurePool")(
    TOKEN_ID,
    MIN_LOCK_DURATION,
    MAX_LOCK_DURATION,
    POOL_ENABLED,
    {
      gasLimit: SAFETY_GAS_LIMIT,
    },
  );

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction 6 failed or reverted on-chain.");
  }

  // 7. Verify Post-Execution State
  const updatedPool = await stakingContract.getFunction("poolConfigs")(TOKEN_ID);
  if (
    !updatedPool[2] ||
    updatedPool[0] !== MIN_LOCK_DURATION ||
    updatedPool[1] !== MAX_LOCK_DURATION
  ) {
    throw new Error("Post-execution verification failed: poolConfigs(1) state mismatch!");
  }

  const feePaid = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=======================================================");
  console.log("=== Transaction 6 Successfully Confirmed & Verified ===");
  console.log("=======================================================");
  console.log("Action:                 PropertyTokenStaking.configurePool");
  console.log("Target Contract:       ", normalizedStaking);
  console.log("Token ID:               #1 (MST-DEMO-PUNE-002)");
  console.log("Min Lock Duration:     ", updatedPool[0].toString(), "seconds (0 days)");
  console.log("Max Lock Duration:     ", updatedPool[1].toString(), "seconds (365 days)");
  console.log("Pool Is Active:        ", updatedPool[2]);
  console.log("Transaction Hash:      ", receipt.hash);
  console.log("Receipt Status:        ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:          ", receipt.blockNumber.toString());
  console.log("Gas Used:              ", receipt.gasUsed.toString(), "units");
  console.log("Gas Price:             ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:       ", formatEther(feePaid), "MST");
  console.log("MSTScan Tx Link:        https://mstscan.com/tx/" + receipt.hash);
  console.log("=======================================================");
}

executeTx6().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 6 FAILED]", msg);
  process.exitCode = 1;
});
