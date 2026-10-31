import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const EXPECTED_ADMIN_ACCOUNT = "0xEF9fE181ed6659096895bb54F71487B67E3b262b";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";

export async function executeStep4To7(stepFilter?: number) {
  console.log("=== MST Mainnet: Admin Compliance & Staking Pool Configuration ===");

  const connection = await network.connect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers, networkName } = connection as any;

  if (networkName !== "mstMainnet") throw new Error("Expected mstMainnet");
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== EXPECTED_ADMIN_ACCOUNT.toLowerCase()) {
    throw new Error("Signer must be Account 1");
  }

  const token = await ethers.getContractAt("PropertyToken", PROPERTY_TOKEN_ADDRESS, signer);
  const staking = await ethers.getContractAt(
    "PropertyTokenStaking",
    STAKING_CONTRACT_ADDRESS,
    signer,
  );

  // Step 4: Staking Contract Eligibility
  if (!stepFilter || stepFilter === 4) {
    const isElig = await token.getFunction("isEligibleInvestor")(STAKING_CONTRACT_ADDRESS);
    if (!isElig) {
      console.log("\nBroadcasting Tx 4: setInvestorEligibility(Staking, true)...");
      const tx4 = await token.getFunction("setInvestorEligibility")(
        STAKING_CONTRACT_ADDRESS,
        true,
        { gasLimit: 65000 },
      );
      console.log("Tx 4 Hash:", tx4.hash);
      const r4 = await tx4.wait(1);
      console.log("✓ Tx 4 Confirmed in block", r4.blockNumber, "Gas used:", r4.gasUsed.toString());
    } else {
      console.log("✓ Step 4: Staking contract already eligible.");
    }
  }

  // Step 5: Staking Contract Authorization Exemption
  if (!stepFilter || stepFilter === 5) {
    const isAuth = await token.getFunction("isAuthorizedStakingContract")(STAKING_CONTRACT_ADDRESS);
    if (!isAuth) {
      console.log("\nBroadcasting Tx 5: setStakingContractAuthorization(Staking, true)...");
      const tx5 = await token.getFunction("setStakingContractAuthorization")(
        STAKING_CONTRACT_ADDRESS,
        true,
        { gasLimit: 65000 },
      );
      console.log("Tx 5 Hash:", tx5.hash);
      const r5 = await tx5.wait(1);
      console.log("✓ Tx 5 Confirmed in block", r5.blockNumber, "Gas used:", r5.gasUsed.toString());
    } else {
      console.log("✓ Step 5: Staking contract already authorized.");
    }
  }

  // Step 6: Configure Staking Pool #1
  if (!stepFilter || stepFilter === 6) {
    const pool = await staking.getFunction("poolConfigs")(1);
    if (!pool[2] || pool[0] !== 0n) {
      console.log("\nBroadcasting Tx 6: configurePool(1, 0, 31536000, true)...");
      const tx6 = await staking.getFunction("configurePool")(1, 0, 31536000, true, {
        gasLimit: 60000,
      });
      console.log("Tx 6 Hash:", tx6.hash);
      const r6 = await tx6.wait(1);
      console.log("✓ Tx 6 Confirmed in block", r6.blockNumber, "Gas used:", r6.gasUsed.toString());
    } else {
      console.log("✓ Step 6: Pool #1 already configured.");
    }
  }

  // Step 7: Whitelist Investor Account 3
  if (!stepFilter || stepFilter === 7) {
    const isAcc3Elig = await token.getFunction("isEligibleInvestor")(INVESTOR_ACCOUNT_3);
    if (!isAcc3Elig) {
      console.log("\nBroadcasting Tx 7: setInvestorEligibility(Account 3, true)...");
      const tx7 = await token.getFunction("setInvestorEligibility")(INVESTOR_ACCOUNT_3, true, {
        gasLimit: 65000,
      });
      console.log("Tx 7 Hash:", tx7.hash);
      const r7 = await tx7.wait(1);
      console.log("✓ Tx 7 Confirmed in block", r7.blockNumber, "Gas used:", r7.gasUsed.toString());
    } else {
      console.log("✓ Step 7: Account 3 is already eligible.");
    }
  }

  console.log("\n=== Admin Compliance Configuration Complete ===");
}
