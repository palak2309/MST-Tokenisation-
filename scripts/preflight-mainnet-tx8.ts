import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TOKEN_ID = 1n;
export const PURCHASE_AMOUNT = 10n;
export const SAFETY_GAS_LIMIT = 150000n;

async function preflightTx8() {
  console.log("=== MST Mainnet: Preflight for Transaction 8 (Account 3 Demo Purchase) ===");

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

  // 2. Refresh Account 3 Identity & Balances
  const normalizedAcc3 = getAddress(INVESTOR_ACCOUNT_3.toLowerCase());
  const [acc3Balance, latestNonce, pendingNonce, blockNumber] = await Promise.all([
    ethers.provider.getBalance(normalizedAcc3),
    ethers.provider.getTransactionCount(normalizedAcc3, "latest"),
    ethers.provider.getTransactionCount(normalizedAcc3, "pending"),
    ethers.provider.getBlockNumber(),
  ]);

  console.log(`\n2. Signer / Investor: ${normalizedAcc3} (Account 3)`);
  console.log(`   Current Block Number: ${blockNumber}`);
  console.log(`   Native Gas Balance:   ${formatEther(acc3Balance)} MST (From Step 1 Funding)`);
  console.log(`   Latest Nonce:         ${latestNonce}`);
  console.log(`   Pending Nonce:        ${pendingNonce}`);

  // 3. Verify PropertyToken on Mainnet
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const tokenCode = await ethers.provider.getCode(normalizedPropertyToken);
  const tokenExists = tokenCode !== "0x" && tokenCode.length > 2;
  console.log(`\n3. PropertyToken Address: ${normalizedPropertyToken}`);
  console.log(`   PropertyToken Contract Exists: ${tokenExists ? "YES (VERIFIED)" : "NO (ERROR)"}`);
  if (!tokenExists) throw new Error("PropertyToken contract does not exist!");

  const propertyToken = await ethers.getContractAt("PropertyToken", normalizedPropertyToken);

  // 4. Verify Account 3 Eligibility on PropertyToken
  const isEligible = await propertyToken.getFunction("isEligibleInvestor")(normalizedAcc3);
  console.log(`\n4. Investor Eligibility Check:`);
  console.log(
    `   isEligibleInvestor(${normalizedAcc3}): ${isEligible ? "YES (CONFIRMED from Tx 7)" : "NO (ERROR)"}`,
  );
  if (!isEligible) throw new Error("Account 3 is not an eligible investor!");

  // 5. Query Property & Current Unit Balance
  const [prop1, currentUnitsBalance, totalSupply1] = await Promise.all([
    propertyToken.getFunction("getProperty")(TOKEN_ID),
    propertyToken.getFunction("balanceOf")(normalizedAcc3, TOKEN_ID),
    propertyToken.getFunction("totalSupply(uint256)")(TOKEN_ID),
  ]);

  console.log(`\n5. Property #1 State & Investor Holdings:`);
  console.log(`   Property Reference:     ${prop1.propertyRef}`);
  console.log(`   Max Supply Cap:         ${prop1.maxSupply.toString()} Units`);
  console.log(`   Current Total Minted:   ${totalSupply1.toString()} Units`);
  console.log(`   Account 3 Current Units: ${currentUnitsBalance.toString()} Units`);
  console.log(`   Demo Units to Purchase: ${PURCHASE_AMOUNT.toString()} Units`);

  // 6. Gas Estimation with Account 3 as `from` via provider directly
  const data = propertyToken.interface.encodeFunctionData("purchaseDemoUnits", [
    TOKEN_ID,
    PURCHASE_AMOUNT,
  ]);
  const gasEstimate = await ethers.provider.estimateGas({
    to: normalizedPropertyToken,
    from: normalizedAcc3,
    data,
  });

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
  const isSufficient = acc3Balance >= maxFeeCap;
  console.log(`\n7. Balance Sufficiency Check:`);
  console.log(`   Required Max Fee:  ${formatEther(maxFeeCap)} MST`);
  console.log(`   Account 3 Balance: ${formatEther(acc3Balance)} MST`);
  console.log(`   Sufficient:        ${isSufficient ? "PASS" : "FAIL"}`);

  // 8. Signer Key Check
  const investorKeySet = !!(
    process.env["MST_MAINNET_INVESTOR_PRIVATE_KEY"] ||
    process.env["MST_MAINNET_ACCOUNT3_PRIVATE_KEY"]
  );
  console.log(`\n8. Account 3 Signer Configuration:`);
  console.log(
    `   Investor Private Key Configured in Env: ${investorKeySet ? "YES" : "NO (Wallet / Key Required)"}`,
  );

  console.log(`\n=== PREFLIGHT COMPLETE: READY FOR APPROVAL ===`);
}

preflightTx8().catch((err) => {
  console.error("Preflight Error:", err);
  process.exitCode = 1;
});
