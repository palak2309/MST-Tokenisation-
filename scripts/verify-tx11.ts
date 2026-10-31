import { network } from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { getAddress, formatEther, formatUnits } from "ethers";

export const MAINNET_CHAIN_ID = 4646n;
export const STAKING_CONTRACT_ADDRESS = "0x57f775299ADF622adc729d0e8854A99d657717Aa";
export const PROPERTY_TOKEN_ADDRESS = "0x290120134219BA03C0ecd47fD35FeD6B10f03839";
export const INVESTOR_ACCOUNT_3 = "0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2";
export const TOKEN_ID = 1n;

async function checkTx11() {
  const connection = await network.connect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ethers } = connection as any;

  const normalizedAcc3 = getAddress(INVESTOR_ACCOUNT_3.toLowerCase());
  const normalizedStaking = getAddress(STAKING_CONTRACT_ADDRESS.toLowerCase());
  const normalizedPropertyToken = getAddress(PROPERTY_TOKEN_ADDRESS.toLowerCase());

  const stakingContract = await ethers.getContractAt("PropertyTokenStaking", normalizedStaking);
  const propertyToken = await ethers.getContractAt("PropertyToken", normalizedPropertyToken);

  const [nonce, walletUnits, stakeRecord, blockNumber] = await Promise.all([
    ethers.provider.getTransactionCount(normalizedAcc3, "latest"),
    propertyToken.getFunction("balanceOf")(normalizedAcc3, TOKEN_ID),
    stakingContract.getFunction("stakes")(TOKEN_ID, normalizedAcc3),
    ethers.provider.getBlockNumber(),
  ]);

  console.log(`Current Block Number:       ${blockNumber}`);
  console.log(`Account 3 Nonce:            ${nonce}`);
  console.log(`Account 3 Wallet Units:     ${walletUnits.toString()}`);
  console.log(`Account 3 Staked Units:     ${stakeRecord[0].toString()}`);

  if (walletUnits >= 10n && stakeRecord[0] === 0n) {
    console.log("STATUS: UNSTAKE_CONFIRMED");
    // Query Unstaked event to find tx hash
    const filter = stakingContract.filters.Unstaked(TOKEN_ID, normalizedAcc3);
    const events = await stakingContract.queryFilter(filter, 21800000, "latest");
    for (const ev of events) {
      console.log(`Unstake Event Tx Hash: ${ev.transactionHash}`);
      console.log(`Unstake Event Block:   ${ev.blockNumber}`);
      const receipt = await ethers.provider.getTransactionReceipt(ev.transactionHash);
      console.log(`Receipt Status:        ${receipt.status}`);
      console.log(`Gas Used:              ${receipt.gasUsed.toString()} units`);
      console.log(`Gas Price:             ${formatUnits(receipt.gasPrice, "gwei")} gwei`);
      console.log(`Fee Paid:              ${formatEther(receipt.gasUsed * receipt.gasPrice)} MST`);
    }
  } else {
    console.log("STATUS: WAITING_FOR_UNSTAKE_CONFIRMATION");
  }
}

checkTx11().catch(console.error);
