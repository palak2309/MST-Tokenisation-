import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";

export const TESTNET_CHAIN_ID = 91562037n;
export const CONFIRMATION_PHRASE = "DEPLOY PROPERTY TOKEN TESTNET";
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

export function validateAdminAddress(
  address: string | undefined,
  isAddressFn: (addr: string) => boolean,
  zeroAddress: string = "0x0000000000000000000000000000000000000000",
): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (trimmed === "" || trimmed === zeroAddress) return false;
  return isAddressFn(trimmed);
}

export function validateConfirmationPhrase(input: string): boolean {
  return input.trim() === CONFIRMATION_PHRASE;
}

export function validateTestnetChainId(chainId: bigint): boolean {
  return chainId === TESTNET_CHAIN_ID;
}

async function main() {
  console.log("=== MST Testnet PropertyToken Deployment Pre-Flight ===");

  const rpcUrl =
    process.env["MST_TESTNET_RPC_URL"]?.trim() || "https://testnetrpc.mstblockchain.com";
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error(`MST_TESTNET_RPC_URL is invalid: ${rpcUrl}`);
  }
  if (parsedRpcUrl.protocol !== "https:" && parsedRpcUrl.protocol !== "http:") {
    throw new Error("MST_TESTNET_RPC_URL must use HTTP or HTTPS.");
  }

  const privateKey = process.env["MST_TESTNET_PRIVATE_KEY"]?.trim();
  if (!privateKey) {
    throw new Error(
      "MST_TESTNET_PRIVATE_KEY is required in the local shell environment or Hardhat configuration variables.\n" +
        "Set it via `npx hardhat vars set MST_TESTNET_PRIVATE_KEY` or in your local terminal session.\n" +
        "Never commit private keys to Git or save them in repository files.",
    );
  }

  const connection = await network.connect();
  if (!("ethers" in connection)) {
    throw new Error("Hardhat ethers plugin is not loaded on this network connection.");
  }
  const { ethers, networkName } = connection;
  if (networkName !== "mstTestnet") {
    throw new Error(
      `Refusing deployment on unexpected Hardhat network "${networkName}". Expected "mstTestnet".`,
    );
  }

  const actualNetwork = await ethers.provider.getNetwork();
  if (!validateTestnetChainId(actualNetwork.chainId)) {
    throw new Error(
      `RPC chain ID is ${actualNetwork.chainId.toString()}; expected MST Testnet chain ID ${TESTNET_CHAIN_ID.toString()}.`,
    );
  }

  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available from configured private key.");
  }

  const signerAddress = await signer.getAddress();
  const balance = await ethers.provider.getBalance(signerAddress);
  console.log("Connected Network: MST Testnet (Chain ID 91562037)");
  console.log("Signer Address:   ", signerAddress);
  console.log("Signer Balance:   ", ethers.formatEther(balance), "MST");

  // Determine and validate designated constructor admin address against deployment plan
  const explicitAdmin = process.env["MST_TESTNET_ADMIN_ADDRESS"]?.trim();
  const adminAddress = explicitAdmin || signerAddress;

  if (!validateAdminAddress(adminAddress, ethers.isAddress, ethers.ZeroAddress)) {
    throw new Error(
      `Invalid designated constructor admin address: "${adminAddress}". Must be a valid non-zero EVM address.`,
    );
  }

  console.log("\n--- Designated Admin (Constructor) ---");
  console.log("Admin Address:           ", adminAddress);
  if (adminAddress.toLowerCase() === signerAddress.toLowerCase()) {
    console.log("Admin Allocation:         Deployer Signer (Wallet 1 - default two-wallet plan)");
  } else {
    console.log("Admin Allocation:         Explicit override (MST_TESTNET_ADMIN_ADDRESS)");
    console.log(
      `Notice: Deployer (${signerAddress}) will broadcast tx; separate account (${adminAddress}) will hold DEFAULT_ADMIN_ROLE.`,
    );
  }

  // Gas estimation and fee buffer calculation
  const factory = await ethers.getContractFactory("PropertyToken", signer);
  const deployTx = await factory.getDeployTransaction(adminAddress);
  const estimatedGas = await ethers.provider.estimateGas(deployTx);
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 1000000000n;
  const estimatedCost = BigInt(estimatedGas) * BigInt(gasPrice);

  const { feeBuffer, requiredBalance } = calculateRequiredBalance(
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  console.log("\n--- Gas & Balance Pre-Flight Check ---");
  console.log("Estimated Gas Units:      ", estimatedGas.toString());
  console.log("Current Gas Price:        ", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Estimated Deployment Cost:", ethers.formatEther(estimatedCost), "MST");
  console.log(
    `Safety Fee Buffer (${DEFAULT_FEE_BUFFER_PERCENT.toString()}%):   ${ethers.formatEther(feeBuffer)} MST`,
  );
  console.log("Required Balance:         ", ethers.formatEther(requiredBalance), "MST");
  console.log("Current Signer Balance:   ", ethers.formatEther(balance), "MST");

  // Balance sufficiency validation with fee buffer
  const balanceCheck = validateDeploymentBalance(
    balance,
    estimatedCost,
    DEFAULT_FEE_BUFFER_PERCENT,
  );

  if (!balanceCheck.sufficient) {
    throw new Error(
      `Insufficient funds for deployment on MST Testnet.\n` +
        `  Signer balance:   ${ethers.formatEther(balance)} MST\n` +
        `  Estimated cost:   ${ethers.formatEther(estimatedCost)} MST\n` +
        `  Required balance: ${ethers.formatEther(requiredBalance)} MST (estimated cost + ${DEFAULT_FEE_BUFFER_PERCENT.toString()}% safety buffer)\n` +
        `  Deficit:          ${ethers.formatEther(balanceCheck.deficit)} MST\n` +
        `Please fund signer account ${signerAddress} with at least ${ethers.formatEther(requiredBalance)} MST via the MST Testnet faucet before attempting deployment.`,
    );
  }
  console.log("✓ Balance check passed: Signer has sufficient funds including buffer.");

  console.log("\n--- Role Assignment Plan ---");
  console.log(`- DEFAULT_ADMIN_ROLE: Granted to ${adminAddress} in constructor.`);
  console.log(
    "- ISSUER_ROLE:        Can be granted by DEFAULT_ADMIN_ROLE to authorized property onboarding addresses (Wallet 2).",
  );
  console.log(
    "- COMPLIANCE_ROLE:    Can be granted by DEFAULT_ADMIN_ROLE to KYC/compliance officer addresses.",
  );
  console.log(
    "- PAUSER_ROLE:        Can be granted by DEFAULT_ADMIN_ROLE to emergency operational addresses.",
  );

  console.log("\n--- Deployment Plan Summary ---");
  console.log("Network:                  MST Testnet (Chain ID 91562037)");
  console.log("Contract:                 PropertyToken (ERC-1155)");
  console.log("Deployer Signer:         ", signerAddress);
  console.log("Constructor Admin:       ", adminAddress);
  console.log("Estimated Deployment Cost:", ethers.formatEther(estimatedCost), "MST");
  console.log("Required Balance:        ", ethers.formatEther(requiredBalance), "MST");

  // Terminal confirmation guard
  const terminal = createInterface({ input: stdin, output: stdout });
  let confirmation: string;
  try {
    confirmation = await terminal.question(
      `\nType "${CONFIRMATION_PHRASE}" to broadcast the transaction to MST Testnet: `,
    );
  } finally {
    terminal.close();
  }

  if (!validateConfirmationPhrase(confirmation)) {
    throw new Error("Deployment cancelled; confirmation phrase did not match.");
  }

  console.log("\nBroadcasting deployment transaction...");
  const tokenContract = await factory.deploy(adminAddress);
  const deploymentTx = tokenContract.deploymentTransaction();
  if (!deploymentTx) {
    throw new Error("Hardhat did not return a deployment transaction.");
  }

  console.log("Transaction Hash:", deploymentTx.hash);
  console.log("Waiting for block confirmation on MST Testnet...");
  const receipt = await deploymentTx.wait(1);

  if (!receipt || receipt.status !== 1) {
    throw new Error("Deployment transaction failed on-chain.");
  }

  const contractAddress = await tokenContract.getAddress();
  const bytecode = await ethers.provider.getCode(contractAddress);
  if (bytecode === "0x") {
    throw new Error("Deployment succeeded, but no bytecode was found at the contract address.");
  }

  console.log("\n=== Deployment Successful! ===");
  console.log("Contract Name:     PropertyToken");
  console.log("Contract Address: ", contractAddress);
  console.log("Block Number:     ", receipt.blockNumber);
  console.log("Transaction Hash: ", receipt.hash);
  console.log("Gas Used:         ", receipt.gasUsed.toString());
  console.log(`Explorer Link:    https://testnet.mstscan.com/address/${contractAddress}`);
  console.log("\n--- Next Steps ---");
  console.log(`1. Add to your local .env:`);
  console.log(`   VITE_MST_TESTNET_TOKEN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   VITE_MST_TOKEN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`2. (Optional) Grant roles using the designated admin account (${adminAddress}):`);
  console.log(`   npm run grant:issuer`);
}

// Only execute automatically when run directly as a script
if (process.argv[1]?.includes("deploy-testnet-token")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unexpected deployment failure.";
    console.error("\nDeployment halted:", message);
    process.exitCode = 1;
  });
}
