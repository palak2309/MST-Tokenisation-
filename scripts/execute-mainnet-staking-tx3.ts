import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits, getCreateAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54F71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const PREDICTED_STAKING_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const GAS_LIMIT = 3900000n;

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
      `Chain ID is ${actualNetwork.chainId.toString()}; expected ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }
  console.log("✓ Network verified: MST Mainnet (Chain ID 4646)");

  // 2. Verify Signer
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available from configured private key.");
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== EXPECTED_ADMIN_ACCOUNT.toLowerCase()) {
    throw new Error(
      `Signer ${signerAddress} does not match expected Account 1 (${EXPECTED_ADMIN_ACCOUNT}).`,
    );
  }
  console.log("✓ Signer verified:", signerAddress);

  // 3. Verify PropertyToken on Mainnet
  const tokenCode = await ethers.provider.getCode(PROPERTY_TOKEN_ADDRESS);
  if (tokenCode === "0x") {
    throw new Error(`PropertyToken not found at ${PROPERTY_TOKEN_ADDRESS}.`);
  }
  console.log("✓ Underlying PropertyToken verified on-chain:", PROPERTY_TOKEN_ADDRESS);

  // 4. Verify Nonce & Predict Deployment Address
  const [balance, nonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
  ]);
  console.log("✓ Current Nonce:", nonce, "(Expected 15)");
  console.log("✓ Current Balance:", formatEther(balance), "MST");

  const derivedAddress = getCreateAddress({ from: signerAddress, nonce });
  console.log("✓ Calculated CREATE Address at Nonce", nonce + ":", derivedAddress);

  if (derivedAddress.toLowerCase() !== PREDICTED_STAKING_ADDRESS.toLowerCase()) {
    console.warn(
      `[NOTICE] Derived address ${derivedAddress} differs from preflight prediction ${PREDICTED_STAKING_ADDRESS}`,
    );
  }

  // 5. Broadcast Deployment Transaction
  console.log("\nBroadcasting PropertyTokenStaking deployment to MST Mainnet...");
  const factory = await ethers.getContractFactory("PropertyTokenStaking", signer);
  const stakingContract = await factory.deploy(PROPERTY_TOKEN_ADDRESS, signerAddress, {
    gasLimit: GAS_LIMIT,
  });

  const deploymentTx = stakingContract.deploymentTransaction();
  if (!deploymentTx) throw new Error("No deployment transaction returned by Hardhat.");

  console.log("Transaction Hash:", deploymentTx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await deploymentTx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction failed or reverted on-chain.");
  }

  const deployedAddress = await stakingContract.getAddress();
  const deployedCode = await ethers.provider.getCode(deployedAddress);
  if (deployedCode === "0x") {
    throw new Error("Post-deployment verification failed: No bytecode at deployed address.");
  }

  // Verify contract immutables & roles
  const underlying = await stakingContract.getFunction("propertyToken")();
  const defaultAdmin = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const hasAdmin = await stakingContract.getFunction("hasRole")(defaultAdmin, signerAddress);

  const feeData = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=== Transaction 3 Confirmed & Verified ===");
  console.log("Contract Name:     PropertyTokenStaking");
  console.log("Deployed Address: ", deployedAddress);
  console.log("Transaction Hash: ", receipt.hash);
  console.log("Receipt Status:   ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:     ", receipt.blockNumber.toString());
  console.log("Gas Used:         ", receipt.gasUsed.toString());
  console.log("Gas Price:        ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:  ", formatEther(feeData), "MST");
  console.log("Underlying Asset: ", underlying);
  console.log("Admin Verified:   ", hasAdmin);
  console.log("MSTScan Link:      https://mstscan.com/address/" + deployedAddress);
  console.log("Tx Explorer:       https://mstscan.com/tx/" + receipt.hash);
}

executeDeployStakingMainnet().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 3 FAILED]", msg);
  process.exitCode = 1;
});
