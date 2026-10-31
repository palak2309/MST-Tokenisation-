import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits, getCreateAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const PREDICTED_STAKING_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const EXPECTED_NONCE = 15;
export const GAS_LIMIT = 3900000n;
export const MAX_FEE_CAP_WEI = 7800000000000000n; // 0.007800 MST

export async function executeDeployStakingMainnet() {
  console.log("=== MST Mainnet: Execute Transaction 3 (Deploy PropertyTokenStaking) ===");

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
  if (actualNetwork.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(
      `Chain ID is ${actualNetwork.chainId.toString()}; expected ${MAINNET_CHAIN_ID.toString()}. Aborting.`,
    );
  }
  console.log("✓ Network verified: MST Mainnet (Chain ID 4646)");

  // 2. Verify Signer
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available from configured private key.");
  const signerAddress = getAddress(await signer.getAddress());
  const expectedAdmin = getAddress(EXPECTED_ADMIN_ACCOUNT.toLowerCase());
  if (signerAddress !== expectedAdmin) {
    throw new Error(
      `Signer ${signerAddress} does not match expected Account 1 (${expectedAdmin}). Aborting.`,
    );
  }
  console.log("✓ Signer verified: Account 1 (" + signerAddress + ")");

  // 3. Verify PropertyToken on Mainnet
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const tokenCode = await ethers.provider.getCode(normalizedPropertyToken);
  if (tokenCode === "0x" || tokenCode.length <= 2) {
    throw new Error(`PropertyToken not found at ${normalizedPropertyToken}. Aborting.`);
  }
  console.log("✓ Underlying PropertyToken verified on-chain:", normalizedPropertyToken);

  // 4. Verify Nonce & Predict Deployment Address
  const [balance, latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
    ethers.provider.getTransactionCount(signerAddress, "pending"),
  ]);

  console.log(`✓ Nonce check: latest=${latestNonce}, pending=${pendingNonce}`);
  if (latestNonce !== EXPECTED_NONCE) {
    throw new Error(
      `Nonce mismatch: Current nonce is ${latestNonce}, expected ${EXPECTED_NONCE}. Aborting.`,
    );
  }
  if (pendingNonce !== latestNonce) {
    throw new Error(
      `Pending nonce mismatch: pending=${pendingNonce} != latest=${latestNonce}. Pending transaction exists! Aborting.`,
    );
  }

  console.log("✓ Current Balance:", formatEther(balance), "MST");

  const derivedAddress = getCreateAddress({ from: signerAddress, nonce: latestNonce });
  console.log("✓ Calculated CREATE Address at Nonce", latestNonce + ":", derivedAddress);

  if (derivedAddress.toLowerCase() !== PREDICTED_STAKING_ADDRESS.toLowerCase()) {
    throw new Error(
      `Derived address ${derivedAddress} differs from approved prediction ${PREDICTED_STAKING_ADDRESS}. Aborting.`,
    );
  }

  // 5. Gas & Fee Verification
  const factory = await ethers.getContractFactory("PropertyTokenStaking", signer);
  const deployTx = await factory.getDeployTransaction(normalizedPropertyToken, signerAddress);
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxPossibleFee = GAS_LIMIT * currentGasPrice;

  console.log("✓ Fresh Gas Estimate:   ", estimatedGas.toString(), "units");
  console.log("✓ Current Gas Price:    ", formatUnits(currentGasPrice, "gwei"), "gwei");
  console.log("✓ Max Fee at Gas Limit: ", formatEther(maxPossibleFee), "MST");

  if (maxPossibleFee > MAX_FEE_CAP_WEI) {
    throw new Error(
      `Maximum fee cap exceeded: ${formatEther(maxPossibleFee)} MST > 0.007800 MST. Aborting.`,
    );
  }
  if (balance < maxPossibleFee) {
    throw new Error(
      `Insufficient balance for deployment: ${formatEther(balance)} MST < ${formatEther(maxPossibleFee)} MST. Aborting.`,
    );
  }
  console.log("✓ Fee check passed: within approved 0.007800 MST cap.");

  // 6. Broadcast Deployment Transaction
  console.log("\n>>> Broadcasting PropertyTokenStaking deployment to MST Mainnet <<<");
  const stakingContract = await factory.deploy(normalizedPropertyToken, signerAddress, {
    gasLimit: GAS_LIMIT,
  });

  const deploymentTx = stakingContract.deploymentTransaction();
  if (!deploymentTx) throw new Error("No deployment transaction returned by Hardhat.");

  console.log("Broadcasted Transaction Hash:", deploymentTx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await deploymentTx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction failed or reverted on-chain.");
  }

  const deployedAddress = await stakingContract.getAddress();
  const deployedCode = await ethers.provider.getCode(deployedAddress);
  if (deployedCode === "0x" || deployedCode.length <= 2) {
    throw new Error("Post-deployment verification failed: No bytecode at deployed address.");
  }

  // Verify contract immutables & roles
  const underlying = await stakingContract.getFunction("propertyToken")();
  const defaultAdmin = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const distributorRole = await stakingContract.getFunction("REWARD_DISTRIBUTOR_ROLE")();
  const pauserRole = await stakingContract.getFunction("PAUSER_ROLE")();

  const [hasAdmin, hasDistributor, hasPauser, isPaused] = await Promise.all([
    stakingContract.getFunction("hasRole")(defaultAdmin, signerAddress),
    stakingContract.getFunction("hasRole")(distributorRole, signerAddress),
    stakingContract.getFunction("hasRole")(pauserRole, signerAddress),
    stakingContract.getFunction("paused")(),
  ]);

  if (underlying.toLowerCase() !== normalizedPropertyToken.toLowerCase()) {
    throw new Error(`propertyToken mismatch on-chain: ${underlying} != ${normalizedPropertyToken}`);
  }
  if (!hasAdmin) throw new Error(`Signer does not have DEFAULT_ADMIN_ROLE`);
  if (!hasDistributor) throw new Error(`Signer does not have REWARD_DISTRIBUTOR_ROLE`);
  if (!hasPauser) throw new Error(`Signer does not have PAUSER_ROLE`);
  if (isPaused) throw new Error(`Staking contract deployed in paused state`);

  const feePaid = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=======================================================");
  console.log("=== Transaction 3 Successfully Confirmed & Verified ===");
  console.log("=======================================================");
  console.log("Contract Name:          PropertyTokenStaking");
  console.log("Deployed Address:      ", deployedAddress);
  console.log("Transaction Hash:      ", receipt.hash);
  console.log("Receipt Status:        ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:          ", receipt.blockNumber.toString());
  console.log("Gas Used:              ", receipt.gasUsed.toString(), "units");
  console.log("Gas Price:             ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:       ", formatEther(feePaid), "MST");
  console.log("Bytecode Size:         ", deployedCode.length.toString(), "characters");
  console.log("Underlying Asset:      ", underlying);
  console.log("Admin Role Verified:   ", hasAdmin);
  console.log("Distributor Role:      ", hasDistributor);
  console.log("Pauser Role:           ", hasPauser);
  console.log("Paused:                ", isPaused);
  console.log("MSTScan Address Link:   https://mstscan.com/address/" + deployedAddress);
  console.log("MSTScan Tx Link:        https://mstscan.com/tx/" + receipt.hash);
  console.log("=======================================================");
}

executeDeployStakingMainnet().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 3 FAILED]", msg);
  process.exitCode = 1;
});
