import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54F71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const SAFETY_GAS_LIMIT = 70000n;

async function preflightTx7() {
  console.log("=== MST Mainnet: Preflight for Transaction 7 (Whitelist Account 3 as Investor) ===");

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

  // 3. Verify PropertyToken on Mainnet
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const tokenCode = await ethers.provider.getCode(normalizedPropertyToken);
  const tokenExists = tokenCode !== "0x" && tokenCode.length > 2;
  console.log(`\n3. PropertyToken Address: ${normalizedPropertyToken}`);
  console.log(`   PropertyToken Contract Exists: ${tokenExists ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!tokenExists) throw new Error("PropertyToken contract does not exist!");

  // 4. Verify Account 3 Subject Address & Native Gas Balance
  const normalizedAcc3 = getAddress(INVESTOR_ACCOUNT_3.toLowerCase());
  const acc3Balance = await ethers.provider.getBalance(normalizedAcc3);
  console.log(`\n4. Investor Subject Address: ${normalizedAcc3} (Account 3)`);
  console.log(`   Account 3 Native Balance:  ${formatEther(acc3Balance)} MST (Funded from Step 1)`);

  // 5. Verify Signer has COMPLIANCE_ROLE on PropertyToken
  const propertyToken = await ethers.getContractAt(
    "PropertyToken",
    normalizedPropertyToken,
    signer,
  );
  const complianceRole = await propertyToken.getFunction("COMPLIANCE_ROLE")();
  const hasCompliance = await propertyToken.getFunction("hasRole")(complianceRole, signerAddress);
  console.log(`\n5. Signer Role Authorization:`);
  console.log(`   COMPLIANCE_ROLE: ${complianceRole}`);
  console.log(`   Signer Has COMPLIANCE_ROLE: ${hasCompliance ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!hasCompliance) throw new Error("Signer lacks COMPLIANCE_ROLE!");

  // 6. Query Current Eligibility State of Account 3
  const currentEligibility = await propertyToken.getFunction("isEligibleInvestor")(normalizedAcc3);
  console.log(`\n6. Current Eligibility State of Account 3:`);
  console.log(`   isEligibleInvestor(${normalizedAcc3}): ${currentEligibility}`);

  // 7. Gas Estimation & Fee Analysis
  const gasEstimate = await propertyToken
    .getFunction("setInvestorEligibility")
    .estimateGas(normalizedAcc3, true);
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxGasPrice = 2000000000n; // 2 gwei max cap

  const estimatedFee = gasEstimate * currentGasPrice;
  const feeAtSafetyLimit = SAFETY_GAS_LIMIT * currentGasPrice;
  const maxFeeCap = SAFETY_GAS_LIMIT * maxGasPrice;

  console.log(`\n7. Gas & Fee Analysis:`);
  console.log(`   Estimated Gas Units:    ${gasEstimate.toString()}`);
  console.log(`   Safety Gas Limit:       ${SAFETY_GAS_LIMIT.toString()}`);
  console.log(`   Current Gas Price:      ${formatUnits(currentGasPrice, "gwei")} gwei`);
  console.log(`   Estimated Fee:          ${formatEther(estimatedFee)} MST`);
  console.log(`   Fee at Safety Limit:    ${formatEther(feeAtSafetyLimit)} MST`);
  console.log(`   Max Fee Cap (@ 2 gwei): ${formatEther(maxFeeCap)} MST`);

  // 8. Balance Sufficiency Check
  const isSufficient = balance >= maxFeeCap;
  console.log(`\n8. Balance Sufficiency Check:`);
  console.log(`   Required Max Fee:  ${formatEther(maxFeeCap)} MST`);
  console.log(`   Available Balance: ${formatEther(balance)} MST`);
  console.log(`   Sufficient:        ${isSufficient ? "PASS" : "FAIL"}`);

  console.log(`\n=== PREFLIGHT COMPLETE: READY FOR APPROVAL ===`);
}

preflightTx7().catch((err) => {
  console.error("Preflight Error:", err);
  process.exitCode = 1;
});
