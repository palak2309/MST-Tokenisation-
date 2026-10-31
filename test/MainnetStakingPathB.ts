import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.create();

describe("Mainnet Path B Staking Architecture", function () {
  const PROPERTY_ID = "MST-DEMO-PUNE-002";
  const PROPERTY_REF = ethers.id(PROPERTY_ID);
  const DOC_HASH = "0x9f2a6c1e7b3d4e58a0c2b9f1d6e8a7c3b5f0e9d2a4c6b8e1f3a5c7d9e0b2a4c6";
  const MAX_SUPPLY = 1500n;
  const UNIT_PRICE = 100000n; // 1,000 INR in paise
  const METADATA_URI = "ipfs://mst/MST-DEMO-PUNE-002";

  async function setupMainnetPathB() {
    const [admin, issuer, investorAccount3, otherInvestor] = await ethers.getSigners();

    // 1. Deploy upgraded PropertyToken with admin
    const token = await ethers.deployContract("PropertyToken", [admin.address]);
    await token.waitForDeployment();

    // Grant roles to simulate Mainnet setup
    await token.connect(admin).grantRole(await token.ISSUER_ROLE(), issuer.address);
    await token.connect(admin).grantRole(await token.COMPLIANCE_ROLE(), admin.address);
    await token.connect(admin).grantRole(await token.PAUSER_ROLE(), admin.address);

    // 2. Register MST-DEMO-PUNE-002
    await token
      .connect(issuer)
      .registerProperty(PROPERTY_REF, DOC_HASH, MAX_SUPPLY, UNIT_PRICE, METADATA_URI);
    const tokenId = await token.tokenIdByPropertyRef(PROPERTY_REF);

    // 3. Whitelist Investor Account 3 and other investor
    await token.connect(admin).setInvestorEligibility(investorAccount3.address, true);
    await token.connect(admin).setInvestorEligibility(otherInvestor.address, true);

    // 4. Issue 10 units to Investor Account 3
    await token.connect(issuer).issueUnits(tokenId, investorAccount3.address, 10n);

    // 5. Deploy PropertyTokenStaking pointing to new token
    const staking = await ethers.deployContract("PropertyTokenStaking", [
      await token.getAddress(),
      admin.address,
    ]);
    await staking.waitForDeployment();

    return {
      token,
      staking,
      admin,
      issuer,
      investorAccount3,
      otherInvestor,
      tokenId,
    };
  }

  it("proves transfersEnabled is false by default on the upgraded token", async function () {
    const { token, tokenId } = await setupMainnetPathB();
    const prop = await token.getProperty(tokenId);
    expect(prop.transfersEnabled).to.equal(false);
  });

  it("strictly blocks ordinary investor-to-investor peer transfers while transfersEnabled is false", async function () {
    const { token, investorAccount3, otherInvestor, tokenId } = await setupMainnetPathB();

    // Both investors are whitelisted (KYC approved)
    expect(await token.isEligibleInvestor(investorAccount3.address)).to.equal(true);
    expect(await token.isEligibleInvestor(otherInvestor.address)).to.equal(true);
    expect(await token.balanceOf(investorAccount3.address, tokenId)).to.equal(10n);

    // Attempting direct peer-to-peer transfer must revert with TransfersDisabled
    await expect(
      token
        .connect(investorAccount3)
        .safeTransferFrom(investorAccount3.address, otherInvestor.address, tokenId, 5n, "0x"),
    )
      .to.be.revertedWithCustomError(token, "TransfersDisabled")
      .withArgs(tokenId);

    // Balances remain intact
    expect(await token.balanceOf(investorAccount3.address, tokenId)).to.equal(10n);
    expect(await token.balanceOf(otherInvestor.address, tokenId)).to.equal(0n);
  });

  it("allows staking and unstaking via role-controlled exemption while ordinary transfers remain disabled", async function () {
    const { token, staking, admin, investorAccount3, otherInvestor, tokenId } =
      await setupMainnetPathB();
    const stakingAddress = await staking.getAddress();

    // 1. Compliance authorizes staking contract
    await token.connect(admin).setInvestorEligibility(stakingAddress, true);
    await token.connect(admin).setStakingContractAuthorization(stakingAddress, true);

    // Configure 0-day demo lock
    await staking.connect(admin).configurePool(tokenId, 0, 365 * 86400, true);

    // 2. Investor approves staking contract operator
    await token.connect(investorAccount3).setApprovalForAll(stakingAddress, true);

    // 3. Ordinary transfer still fails
    await expect(
      token
        .connect(investorAccount3)
        .safeTransferFrom(investorAccount3.address, otherInvestor.address, tokenId, 2n, "0x"),
    )
      .to.be.revertedWithCustomError(token, "TransfersDisabled")
      .withArgs(tokenId);

    // 4. Staking 10 units succeeds
    await expect(staking.connect(investorAccount3).stake(tokenId, 10n, 0)).to.emit(
      staking,
      "Staked",
    );

    // Verify custody and positions
    expect(await token.balanceOf(investorAccount3.address, tokenId)).to.equal(0n);
    expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(10n);

    const stakeRecord = await staking.getStakeInfo(tokenId, investorAccount3.address);
    expect(stakeRecord.amount).to.equal(10n);
    expect(stakeRecord.isLocked).to.equal(false);

    // 5. Unstaking 10 units succeeds and returns tokens to Investor Account 3
    await expect(staking.connect(investorAccount3).unstake(tokenId, 10n))
      .to.emit(staking, "Unstaked")
      .withArgs(tokenId, investorAccount3.address, 10n);

    expect(await token.balanceOf(investorAccount3.address, tokenId)).to.equal(10n);
    expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(0n);

    // 6. Ordinary transfer STILL fails after unstaking
    await expect(
      token
        .connect(investorAccount3)
        .safeTransferFrom(investorAccount3.address, otherInvestor.address, tokenId, 5n, "0x"),
    )
      .to.be.revertedWithCustomError(token, "TransfersDisabled")
      .withArgs(tokenId);
  });

  it("blocks direct unsolicited transfers into the staking contract", async function () {
    const { token, staking, admin, investorAccount3, tokenId } = await setupMainnetPathB();
    const stakingAddress = await staking.getAddress();

    await token.connect(admin).setInvestorEligibility(stakingAddress, true);
    await token.connect(admin).setStakingContractAuthorization(stakingAddress, true);

    // Direct ERC-1155 safeTransferFrom to staking contract must revert with DirectDepositNotAllowed
    await expect(
      token
        .connect(investorAccount3)
        .safeTransferFrom(investorAccount3.address, stakingAddress, tokenId, 5n, "0x"),
    ).to.be.revertedWithCustomError(staking, "DirectDepositNotAllowed");
  });
});
