import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits, getCreateAddress } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54f71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const GAS_LIMIT = 3900000n;

async function preflightStakingTx3() {
  console.log("=== MST Mainnet: Preflight for Transaction 3 (Deploy PropertyTokenStaking) ===");

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet") {
    throw new Error(`Connected to ${networkName}, expected mstMainnet`);
  }

  // 1. Confirm Chain ID & RPC
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId;
  const rpcUrl = process.env["MST_MAINNET_RPC_URL"] || "https://mariorpc.mstblockchain.com/";
  console.log(`\n1. Chain ID: ${chainId.toString()} (Expected: ${MAINNET_CHAIN_ID.toString()})`);
  console.log(`   Configured RPC: ${rpcUrl}`);
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Chain ID mismatch: ${chainId} != ${MAINNET_CHAIN_ID}`);
  }

  // 2. Refresh Signer, Account 1 Balance & Nonce
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

  // 3. Verify PropertyToken contract on Mainnet
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const tokenCode = await ethers.provider.getCode(normalizedPropertyToken);
  const tokenExists = tokenCode !== "0x" && tokenCode.length > 2;
  console.log(`\n3. PropertyToken Address: ${normalizedPropertyToken}`);
  console.log(`   On-chain Bytecode Length: ${tokenCode.length} characters`);
  console.log(`   PropertyToken Contract Exists: ${tokenExists ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!tokenExists) {
    throw new Error(`No bytecode at PropertyToken address: ${normalizedPropertyToken}`);
  }

  // Verify PropertyToken has demo property 1 registered
  const propertyToken = await ethers.getContractAt(
    "PropertyToken",
    normalizedPropertyToken,
    signer,
  );
  const prop1 = await propertyToken.getProperty(1);
  const currentSupply = await propertyToken.getFunction("totalSupply(uint256)")(1);
  console.log(`   Token ID #1 Reference: ${prop1.propertyRef}`);
  console.log(`   Token ID #1 Max Supply: ${prop1.maxSupply.toString()}`);
  console.log(`   Token ID #1 Current Supply: ${currentSupply.toString()}`);
  console.log(`   Token ID #1 Unit Price: ${prop1.unitPriceReference.toString()} paise`);
  console.log(`   Token ID #1 Transfers Enabled: ${prop1.transfersEnabled}`);

  // 4. Staking Constructor Arguments
  const constructorArgs = [normalizedPropertyToken, signerAddress];
  console.log(`\n4. Staking Deployment Constructor Arguments:`);
  console.log(`   - propertyTokenAddress: ${constructorArgs[0]}`);
  console.log(`   - adminAddress:         ${constructorArgs[1]}`);

  // 5. Predict Deployment Address
  const predictedAddress = getCreateAddress({
    from: signerAddress,
    nonce: latestNonce,
  });
  console.log(`\n5. Predicted CREATE Address (at Nonce ${latestNonce}): ${predictedAddress}`);

  // 6. Gas Estimation and Fee Calculation
  const factory = await ethers.getContractFactory("PropertyTokenStaking", signer);
  const deployTx = await factory.getDeployTransaction(normalizedPropertyToken, signerAddress);
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n; // default 1 gwei
  const maxGasPrice = 2000000000n; // 2 gwei max cap

  const estimatedFee = estimatedGas * currentGasPrice;
  const maxFeeAtGasLimit = GAS_LIMIT * maxGasPrice;
  const feeAtGasLimitCurrentPrice = GAS_LIMIT * currentGasPrice;

  console.log(`\n6. Gas & Fee Analysis:`);
  console.log(`   Estimated Gas Units:   ${estimatedGas.toString()}`);
  console.log(`   Safety Gas Limit:      ${GAS_LIMIT.toString()}`);
  console.log(`   Current Gas Price:     ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:         ${formatEther(estimatedFee)} MST`);
  console.log(`   Fee at Gas Limit (1 gwei): ${formatEther(feeAtGasLimitCurrentPrice)} MST`);
  console.log(`   Max Fee Cap (Limit @ 2 gwei): ${formatEther(maxFeeAtGasLimit)} MST`);

  // Balance sufficiency check
  const hasSufficientBalance = balance >= maxFeeAtGasLimit;
  console.log(`\n7. Balance Sufficiency Check:`);
  console.log(`   Required Max Fee:  ${formatEther(maxFeeAtGasLimit)} MST`);
  console.log(`   Available Balance: ${formatEther(balance)} MST`);
  console.log(`   Sufficient:        ${hasSufficientBalance ? "PASS" : "FAIL"}`);

  console.log(`\n=== PREFLIGHT COMPLETE: READY FOR APPROVAL ===`);
}

preflightStakingTx3().catch((err) => {
  console.error("Preflight Error:", err);
  process.exitCode = 1;
});
