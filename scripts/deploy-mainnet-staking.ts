import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const CONFIRMATION_PHRASE = "DEPLOY STAKING CONTRACT MAINNET";
export const DEFAULT_FEE_BUFFER_PERCENT = 20n; // 20% safety margin for gas price volatility

export interface BalanceValidationResult {
  sufficient: boolean;
  estimatedCost: bigint;
  feeBuffer: bigint;
  requiredBalance: bigint;
  deficit: bigint;
}

export function calculateRequiredBalance(
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): { feeBuffer: bigint; requiredBalance: bigint } {
  if (estimatedCost < 0n) {
    throw new Error("Estimated cost cannot be negative.");
  }
  if (feeBufferPercent < 0n) {
    throw new Error("Fee buffer percentage cannot be negative.");
  }
  const feeBuffer = (estimatedCost * feeBufferPercent) / 100n;
  const requiredBalance = estimatedCost + feeBuffer;
  return { feeBuffer, requiredBalance };
}

export function validateDeploymentBalance(
  balance: bigint,
  estimatedCost: bigint,
  feeBufferPercent: bigint = DEFAULT_FEE_BUFFER_PERCENT,
): BalanceValidationResult {
  const { feeBuffer, requiredBalance } = calculateRequiredBalance(estimatedCost, feeBufferPercent);

  if (balance < requiredBalance) {
    return {
      sufficient: false,
      estimatedCost,
      feeBuffer,
      requiredBalance,
      deficit: requiredBalance - balance,
    };
  }

  return {
    sufficient: true,
    estimatedCost,
    feeBuffer,
    requiredBalance,
    deficit: 0n,
  };
}

export function validateAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed.toLowerCase() === zeroAddress.toLowerCase()) return false;
  return isAddressFn(trimmed);
}

export function validateConfirmationPhrase(input: string): boolean {
  return input.trim() === CONFIRMATION_PHRASE;
}

export function validateMainnetChainId(chainId: bigint): boolean {
  return chainId === MAINNET_CHAIN_ID;
}

export function normalizeScriptPath(filePath: string): string {
  try {
    return path.resolve(filePath).toLowerCase().replace(/\\/g, "/");
  } catch {
    return "";
  }
}

export function matchesScriptPath(arg: string, targetNormalized: string): boolean {
  if (!arg || typeof arg !== "string" || arg.startsWith("-")) {
    return false;
  }
  const normalizedArg = normalizeScriptPath(arg);
  if (!normalizedArg) return false;
  if (normalizedArg === targetNormalized) return true;
  if (`${normalizedArg}.ts` === targetNormalized || `${normalizedArg}.js` === targetNormalized) {
    return true;
  }
  return false;
}

export function isDirectExecution(
  importMetaUrl: string,
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env["VITEST"] === "true" || env["HARDHAT_TEST"] === "true" || env["NODE_ENV"] === "test") {
    return false;
  }

  if (!importMetaUrl || !Array.isArray(argv) || argv.length < 2) {
    return false;
  }

  let targetPath: string;
  try {
    targetPath = fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }

  const targetNormalized = normalizeScriptPath(targetPath);
  if (!targetNormalized) {
    return false;
  }

  const directArg = argv[1];
  if (directArg && matchesScriptPath(directArg, targetNormalized)) {
    return true;
  }

  const isHardhatRunner = argv.some(
    (arg) => typeof arg === "string" && arg.toLowerCase().includes("hardhat"),
  );
  const isHardhatRunTask = argv.includes("run");

  if (isHardhatRunner) {
    return (
      isHardhatRunTask && argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized))
    );
  }

  return argv.slice(2).some((arg) => matchesScriptPath(arg, targetNormalized));
}

async function main() {
  console.log("=== MST Mainnet PropertyTokenStaking Deployment Pre-Flight ===");

  const rpcUrl =
    process.env["MST_MAINNET_RPC_URL"]?.trim() || "https://mariorpc.mstblockchain.com/";
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error(`MST_MAINNET_RPC_URL is invalid: ${rpcUrl}`);
  }
  if (parsedRpcUrl.protocol !== "https:" && parsedRpcUrl.protocol !== "http:") {
    throw new Error("MST_MAINNET_RPC_URL must use HTTP or HTTPS.");
  }

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;
  if (networkName !== "mstMainnet") {
    throw new Error(
      `Refusing deployment on unexpected network "${networkName}". Expected "mstMainnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateMainnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Mainnet chain ID ${MAINNET_CHAIN_ID.toString()}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }

  const signerAddress: string = await signer.getAddress();
  const balance: bigint = BigInt(await ethers.provider.getBalance(signerAddress));

  console.log("\n--- Signer & Identity ---");
  console.log("Connected Network:        MST Mainnet (Chain ID 4646)");
  console.log("Deployer Signer Address: ", signerAddress);
  console.log("Deployer Native Balance: ", ethers.formatEther(balance), "MST");

  const rawTokenAddress =
    process.env["MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim() ||
    process.env["VITE_MST_MAINNET_TOKEN_CONTRACT_ADDRESS"]?.trim();

  if (!rawTokenAddress || !validateAddress(rawTokenAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      `Invalid or missing PropertyToken address: "${rawTokenAddress}". Set MST_MAINNET_TOKEN_CONTRACT_ADDRESS.`,
    );
  }

  const tokenAddress = ethers.getAddress(rawTokenAddress);
  const tokenCode = await ethers.provider.getCode(tokenAddress);
  if (tokenCode === "0x") {
    throw new Error(
      `No contract bytecode found at PropertyToken address "${tokenAddress}" on MST Mainnet. Ensure PropertyToken is deployed first.`,
    );
  }
  console.log("Target PropertyToken Address: ", tokenAddress, "(Verified On-Chain)");

  // Determine designated constructor admin address
  const explicitAdmin = process.env["MST_MAINNET_ADMIN_ADDRESS"]?.trim();
  const rawAdminAddress = explicitAdmin || signerAddress;

  if (!validateAddress(rawAdminAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      `Invalid designated constructor admin address: "${rawAdminAddress}". Must be a valid non-zero EVM address.`,
    );
  }
  const adminAddress = ethers.getAddress(rawAdminAddress);

  console.log("\n--- Designated Admin (Constructor) ---");
  console.log("Admin Address:            ", adminAddress);

  // Gas estimation and fee buffer calculation
  const factory = await ethers.getContractFactory("PropertyTokenStaking", signer);
  const deployTx = await factory.getDeployTransaction(tokenAddress, adminAddress);
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedCost = BigInt(estimatedGas) * BigInt(gasPrice);

  const { feeBuffer, requiredBalance } = calculateRequiredBalance(
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  console.log("\n--- Gas & Balance Pre-Flight Check ---");
  console.log("Estimated Gas Units:       ", estimatedGas.toString());
  console.log("Current Gas Price:         ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated Deployment Cost: ", ethers.formatEther(estimatedCost), "MST");
  console.log(
    `Safety Fee Buffer (${DEFAULT_FEE_BUFFER_PERCENT.toString()}%):    ${ethers.formatEther(feeBuffer)} MST`,
  );
  console.log("Required Balance:          ", ethers.formatEther(requiredBalance), "MST");

  const balanceCheck = validateDeploymentBalance(
    balance,
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient funds for deployment on MST Mainnet.\n` +
        `  Deployer balance: ${ethers.formatEther(balance)} MST\n` +
        `  Required balance: ${ethers.formatEther(requiredBalance)} MST (including 20% buffer)\n` +
        `  Deficit:          ${ethers.formatEther(balanceCheck.deficit)} MST\n` +
        `Please fund deployer account ${signerAddress} before attempting deployment.`,
    );
  }
  console.log("✓ Balance check passed: Signer has sufficient funds for deployment.");

  console.log("\n--- Staking Contract Architectural Parameters ---");
  console.log("Underlying Asset:         PropertyToken ERC-1155");
  console.log("Custody Mechanism:        OpenZeppelin ERC1155Holder Safe Custody");
  console.log("Contract Admin:           ", adminAddress);
  console.log("Reward Funding Model:     Funded Native MST Distribution (Pro-Rata)");
  console.log(
    "Emergency Controls:       Pausable circuit breaker + Emergency Principal Withdrawal",
  );

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast the transaction to MST Mainnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Deployment cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting deployment transaction to MST Mainnet...");
  const stakingContract = await factory.deploy(tokenAddress, adminAddress);
  const deploymentTx = stakingContract.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Hardhat did not return a deployment transaction.");
  }

  console.log("Transaction Hash:", deploymentTx.hash);
  console.log("Waiting for block confirmation on MST Mainnet...");
  const receipt = await deploymentTx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction failed on-chain.");
  }

  const stakingAddress = await stakingContract.getAddress();

  // Post-deployment verification
  console.log("\n--- Post-Deployment Verification ---");
  const bytecode = await ethers.provider.getCode(stakingAddress);
  if (bytecode === "0x") {
    throw new Error("Post-deployment failure: No bytecode found at deployed contract address.");
  }
  console.log("✓ On-chain bytecode verified.");

  const underlyingToken: string = await stakingContract.getFunction("propertyToken")();
  if (underlyingToken.toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error(
      `Post-deployment failure: propertyToken mismatch. Expected ${tokenAddress}, got ${underlyingToken}`,
    );
  }
  console.log("✓ Underlying PropertyToken immutability verified:", underlyingToken);

  const defaultAdminRole: string = await stakingContract.getFunction("DEFAULT_ADMIN_ROLE")();
  const rewardDistributorRole: string =
    await stakingContract.getFunction("REWARD_DISTRIBUTOR_ROLE")();
  const pauserRole: string = await stakingContract.getFunction("PAUSER_ROLE")();

  const [hasAdmin, hasDistributor, hasPauser, isPaused] = await Promise.all([
    stakingContract.getFunction("hasRole")(defaultAdminRole, adminAddress),
    stakingContract.getFunction("hasRole")(rewardDistributorRole, adminAddress),
    stakingContract.getFunction("hasRole")(pauserRole, adminAddress),
    stakingContract.getFunction("paused")(),
  ]);

  if (!hasAdmin)
    throw new Error(`Post-deployment failure: DEFAULT_ADMIN_ROLE not held by ${adminAddress}`);
  if (!hasDistributor)
    throw new Error(`Post-deployment failure: REWARD_DISTRIBUTOR_ROLE not held by ${adminAddress}`);
  if (!hasPauser)
    throw new Error(`Post-deployment failure: PAUSER_ROLE not held by ${adminAddress}`);
  if (isPaused)
    throw new Error(
      "Post-deployment failure: Staking contract unexpectedly initialized in paused state.",
    );

  console.log("✓ DEFAULT_ADMIN_ROLE verified on", adminAddress);
  console.log("✓ REWARD_DISTRIBUTOR_ROLE verified on", adminAddress);
  console.log("✓ PAUSER_ROLE verified on", adminAddress);
  console.log("✓ Contract unpaused and ready for pool configuration.");

  console.log("\n=== Deployment Successful! ===");
  console.log("Contract Name:     PropertyTokenStaking");
  console.log("Contract Address: ", stakingAddress);
  console.log("Block Number:     ", receipt.blockNumber);
  console.log("Transaction Hash: ", receipt.hash);
  console.log("Gas Used:         ", receipt.gasUsed.toString());
  console.log(`Explorer Link:    https://mstscan.com/address/${stakingAddress}`);

  console.log("\n--- CRITICAL NEXT STEP: COMPLIANCE AUTHORIZATION ---");
  console.log(
    "Before stakers can deposit, an account with COMPLIANCE_ROLE on PropertyToken must execute:",
  );
  console.log(`1. propertyToken.setInvestorEligibility("${stakingAddress}", true)`);
  console.log(`2. propertyToken.setStakingContractAuthorization("${stakingAddress}", true)`);
  console.log(
    "Notice: Ordinary secondary transfers (transfersEnabled) can remain strictly FALSE for all properties;\n" +
      "the role-controlled staking exemption safely authorizes the staking contract exclusively.",
  );

  console.log("\n--- ENVIRONMENT VARIABLES TO CONFIGURE ---");
  console.log("1. Add to local .env and Cloudflare Pages/Workers build env:");
  console.log(`   VITE_MST_MAINNET_STAKING_CONTRACT_ADDRESS=${stakingAddress}`);
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected deployment failure.";
    console.error("\nDeployment halted:", message);
    process.exitCode = 1;
  });
}
