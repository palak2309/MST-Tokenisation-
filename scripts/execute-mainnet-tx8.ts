import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits, Wallet } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const EXPECTED_INVESTOR_ACCOUNT = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TOKEN_ID = 1n;
export const PURCHASE_AMOUNT = 10n;
export const EXPECTED_NONCE = 0;
export const SAFETY_GAS_LIMIT = 150000n;
export const MAX_FEE_CAP_WEI = 300000000000000n; // 0.000300 MST (150,000 * 2 gwei)

export async function executeTx8() {
  console.log("=== MST Mainnet: Execute Transaction 8 (Account 3 Demo Purchase) ===");

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

  // 2. Resolve Signer for Account 3
  const investorKey =
    process.env["MST_MAINNET_INVESTOR_PRIVATE_KEY"] ||
    process.env["MST_MAINNET_ACCOUNT3_PRIVATE_KEY"];

  let signer: Wallet;
  if (investorKey) {
    signer = new Wallet(investorKey.trim(), ethers.provider);
  } else {
    throw new Error(
      "Account 3 private key is not configured in environment.\n" +
        "Set MST_MAINNET_INVESTOR_PRIVATE_KEY in .env to broadcast via CLI,\n" +
        "OR confirm the transaction in your connected wallet (Account 3) on the web app.",
    );
  }

  const signerAddress = getAddress(await signer.getAddress());
  const expectedInvestor = getAddress(EXPECTED_INVESTOR_ACCOUNT.toLowerCase());
  if (signerAddress !== expectedInvestor) {
    throw new Error(
      `Configured investor key resolves to ${signerAddress}, expected Account 3 (${expectedInvestor})`,
    );
  }

  // 3. Verify Nonce & Balance
  const [balance, latestNonce, pendingNonce] = await Promise.all([
    ethers.provider.getBalance(signerAddress),
    ethers.provider.getTransactionCount(signerAddress, "latest"),
    ethers.provider.getTransactionCount(signerAddress, "pending"),
  ]);

  console.log(`✓ Signer verified: Account 3 (${signerAddress})`);
  console.log(`✓ Nonce check: latest=${latestNonce}, pending=${pendingNonce}`);
  if (latestNonce !== EXPECTED_NONCE) {
    throw new Error(`Nonce mismatch: latest=${latestNonce}, expected ${EXPECTED_NONCE}`);
  }
  if (pendingNonce !== latestNonce) {
    throw new Error(`Pending nonce mismatch: pending=${pendingNonce} != latest=${latestNonce}`);
  }

  // 4. Verify Target Contract & Account 3 Eligibility
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());
  const propertyToken = await ethers.getContractAt(
    "PropertyToken",
    normalizedPropertyToken,
    signer,
  );

  const isEligible = await propertyToken.getFunction("isEligibleInvestor")(signerAddress);
  if (!isEligible) throw new Error("Account 3 is not an eligible investor on PropertyToken!");

  // 5. Gas & Fee Check
  const feeData = await ethers.provider.getFeeData();
  const currentGasPrice = feeData.gasPrice ?? 1000000000n;
  const maxFee = SAFETY_GAS_LIMIT * currentGasPrice;
  if (maxFee > MAX_FEE_CAP_WEI) throw new Error("Max fee exceeds cap!");
  if (balance < maxFee) throw new Error("Insufficient balance for gas!");

  // 6. Broadcast Transaction 8
  console.log(
    `\n>>> Broadcasting Transaction 8: purchaseDemoUnits(tokenId: ${TOKEN_ID}, amount: ${PURCHASE_AMOUNT}) <<<`,
  );
  const tx = await propertyToken.getFunction("purchaseDemoUnits")(TOKEN_ID, PURCHASE_AMOUNT, {
    gasLimit: SAFETY_GAS_LIMIT,
  });

  console.log("Transaction Hash:", tx.hash);
  console.log("Waiting for confirmation on MST Mainnet...");
  const receipt = await tx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction 8 failed or reverted on-chain.");
  }

  // 7. Verify Post-Execution State
  const unitsBalance = await propertyToken.getFunction("balanceOf")(signerAddress, TOKEN_ID);
  if (unitsBalance < PURCHASE_AMOUNT) {
    throw new Error(
      `Post-execution failure: units balance is ${unitsBalance}, expected >= ${PURCHASE_AMOUNT}`,
    );
  }

  const feePaid = receipt.gasUsed * receipt.gasPrice;

  console.log("\n=======================================================");
  console.log("=== Transaction 8 Successfully Confirmed & Verified ===");
  console.log("=======================================================");
  console.log("Action:                 PropertyToken.purchaseDemoUnits");
  console.log("Target Contract:       ", normalizedPropertyToken);
  console.log("Signer (Buyer):        ", signerAddress, "(Account 3)");
  console.log("Token ID:               #1 (MST-DEMO-PUNE-002)");
  console.log("Purchased Amount:      ", PURCHASE_AMOUNT.toString(), "Units");
  console.log("New Units Balance:     ", unitsBalance.toString(), "Units (VERIFIED ON-CHAIN)");
  console.log("Transaction Hash:      ", receipt.hash);
  console.log("Receipt Status:        ", receipt.status === 1 ? "1 (SUCCESS)" : "FAILED");
  console.log("Block Number:          ", receipt.blockNumber.toString());
  console.log("Gas Used:              ", receipt.gasUsed.toString(), "units");
  console.log("Gas Price:             ", formatUnits(receipt.gasPrice, "gwei"), "gwei");
  console.log("Actual Fee Paid:       ", formatEther(feePaid), "MST");
  console.log("MSTScan Tx Link:        https://mstscan.com/tx/" + receipt.hash);
  console.log("=======================================================");
}

executeTx8().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n[TRANSACTION 8 FAILED]", msg);
  process.exitCode = 1;
});
