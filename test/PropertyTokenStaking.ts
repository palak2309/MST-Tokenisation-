import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.create();

const REF = ethers.id("PRP-STAKE-001");
const DOC = ethers.sha256(ethers.toUtf8Bytes("staking document bundle"));

describe("PropertyTokenStaking", function () {
  async function setup() {
    const [admin, issuer, compliance, pauser, distributor, alice, bob, outsider] =
      await ethers.getSigners();

    // 1. Deploy PropertyToken
    const token = await ethers.deployContract("PropertyToken", [admin.address]);
    await token.waitForDeployment();

    await token.grantRole(await token.ISSUER_ROLE(), issuer.address);
    await token.grantRole(await token.COMPLIANCE_ROLE(), compliance.address);
    await token.grantRole(await token.PAUSER_ROLE(), pauser.address);

    // 2. Deploy PropertyTokenStaking
    const staking = await ethers.deployContract("PropertyTokenStaking", [
      await token.getAddress(),
      admin.address,
    ]);
    await staking.waitForDeployment();

    await staking.grantRole(await staking.REWARD_DISTRIBUTOR_ROLE(), distributor.address);
    await staking.grantRole(await staking.PAUSER_ROLE(), pauser.address);

    // 3. Register Property 1 on PropertyToken
    await token.connect(issuer).registerProperty(REF, DOC, 10000n, 1000n, "ipfs://meta/stake1");
    const tokenId = 1n;

    // 4. Whitelist investors Alice and Bob
    await token.connect(compliance).setInvestorEligibility(alice.address, true);
    await token.connect(compliance).setInvestorEligibility(bob.address, true);

    // 5. Issue units to Alice (500 units) and Bob (500 units)
    await token.connect(issuer).issueUnits(tokenId, alice.address, 500n);
    await token.connect(issuer).issueUnits(tokenId, bob.address, 500n);

    return {
      token,
      staking,
      admin,
      issuer,
      compliance,
      pauser,
      distributor,
      alice,
      bob,
      outsider,
      tokenId,
    };
  }

  describe("Compliance & Authorization Integration", function () {
    it("rejects staking if the staking contract is not an authorized eligible investor on PropertyToken", async function () {
      const { token, staking, alice, tokenId } = await setup();
      // Enable secondary transfers on token
      const compliance = (await ethers.getSigners())[2];
      await token.connect(compliance).setTransfersEnabled(tokenId, true);

      // Alice approves staking contract
      await token.connect(alice).setApprovalForAll(await staking.getAddress(), true);

      // Staking contract NOT whitelisted yet on PropertyToken
      await expect(
        staking.connect(alice).stake(tokenId, 100n, 86400),
      ).to.be.revertedWithCustomError(staking, "StakingContractNotAuthorized");
    });

    it("rejects staking if secondary transfers are disabled for the token ID", async function () {
      const { token, staking, compliance, alice, tokenId } = await setup();
      // Whitelist staking contract
      await token.connect(compliance).setInvestorEligibility(await staking.getAddress(), true);
      // Alice approves staking contract
      await token.connect(alice).setApprovalForAll(await staking.getAddress(), true);

      // Transfers are DISABLED by default
      await expect(staking.connect(alice).stake(tokenId, 100n, 86400))
        .to.be.revertedWithCustomError(staking, "TransfersDisabledForToken")
        .withArgs(tokenId);
    });

    it("rejects staking if the investor is not an eligible investor", async function () {
      const { token, staking, compliance, outsider, tokenId } = await setup();
      await token.connect(compliance).setInvestorEligibility(await staking.getAddress(), true);
      await token.connect(compliance).setTransfersEnabled(tokenId, true);

      await expect(staking.connect(outsider).stake(tokenId, 10n, 86400))
        .to.be.revertedWithCustomError(staking, "IneligibleInvestor")
        .withArgs(outsider.address);
    });

    it("allows staking when staking contract is whitelisted, investor is eligible, and transfers are enabled", async function () {
      const { token, staking, compliance, alice, tokenId } = await setup();
      // Authorize staking contract compliant-ly
      await token.connect(compliance).setInvestorEligibility(await staking.getAddress(), true);
      await token.connect(compliance).setTransfersEnabled(tokenId, true);
      await token.connect(alice).setApprovalForAll(await staking.getAddress(), true);

      await expect(staking.connect(alice).stake(tokenId, 200n, 7 * 86400)).to.emit(
        staking,
        "Staked",
      );

      // Verify contract holds custody of the ERC-1155 tokens
      expect(await token.balanceOf(await staking.getAddress(), tokenId)).to.equal(200n);
      expect(await token.balanceOf(alice.address, tokenId)).to.equal(300n);

      // Verify staking record
      const info = await staking.getStakeInfo(tokenId, alice.address);
      expect(info.amount).to.equal(200n);
      expect(info.isLocked).to.equal(true);
      expect(info.pendingRewards).to.equal(0n);
    });

    it("supports staking deposits and unstaking via exemption when transfersEnabled is false", async function () {
      const { token, staking, compliance, alice, bob, tokenId } = await setup();
      const stakingAddress = await staking.getAddress();

      // Ensure transfersEnabled is false for the property
      const prop = await token.getProperty(tokenId);
      expect(prop.transfersEnabled).to.equal(false);

      // Compliance authorises staking contract as eligible investor AND authorized staking contract
      await token.connect(compliance).setInvestorEligibility(stakingAddress, true);
      await token.connect(compliance).setStakingContractAuthorization(stakingAddress, true);

      // Alice approves operator
      await token.connect(alice).setApprovalForAll(stakingAddress, true);

      // 1. Ordinary transfer from Alice to Bob MUST REVERT
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, tokenId, 50n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");

      // 2. Staking deposit through staking contract SUCCEEDS
      await expect(staking.connect(alice).stake(tokenId, 150n, 0)).to.emit(staking, "Staked");
      expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(150n);
      expect(await token.balanceOf(alice.address, tokenId)).to.equal(350n);

      // 3. Unstaking (0 lock duration) SUCCEEDS and returns tokens to Alice
      await expect(staking.connect(alice).unstake(tokenId, 50n)).to.emit(staking, "Unstaked");
      expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(100n);
      expect(await token.balanceOf(alice.address, tokenId)).to.equal(400n);

      // 4. Emergency withdraw also SUCCEEDS and returns all remaining units
      await expect(staking.connect(alice).emergencyWithdraw(tokenId)).to.emit(
        staking,
        "EmergencyWithdrawn",
      );
      expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(0n);
      expect(await token.balanceOf(alice.address, tokenId)).to.equal(500n);

      // 5. Ordinary transfer from Alice to Bob STILL REVERTS
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, tokenId, 50n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");
    });

    it("rejects direct transfers to staking contract, enforcing deposit through stake()", async function () {
      const { token, staking, compliance, alice, tokenId } = await setup();
      const stakingAddress = await staking.getAddress();

      await token.connect(compliance).setInvestorEligibility(stakingAddress, true);
      await token.connect(compliance).setStakingContractAuthorization(stakingAddress, true);

      // Direct transfer attempt from alice to staking contract
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, stakingAddress, tokenId, 10n, "0x"),
      ).to.be.revertedWithCustomError(staking, "DirectDepositNotAllowed");
    });
  });

  describe("Lock Periods & Unstaking", function () {
    async function authorizedSetup() {
      const ctx = await setup();
      await ctx.token
        .connect(ctx.compliance)
        .setInvestorEligibility(await ctx.staking.getAddress(), true);
      await ctx.token.connect(ctx.compliance).setTransfersEnabled(ctx.tokenId, true);
      await ctx.token.connect(ctx.alice).setApprovalForAll(await ctx.staking.getAddress(), true);
      await ctx.token.connect(ctx.bob).setApprovalForAll(await ctx.staking.getAddress(), true);
      return ctx;
    }

    it("enforces configured minimum and maximum lock duration", async function () {
      const { staking, admin, alice, tokenId } = await authorizedSetup();
      // Configure pool: min 7 days, max 30 days
      await staking.connect(admin).configurePool(tokenId, 7 * 86400, 30 * 86400, true);

      // Under min duration
      await expect(
        staking.connect(alice).stake(tokenId, 100n, 1 * 86400),
      ).to.be.revertedWithCustomError(staking, "InvalidLockDuration");

      // Over max duration
      await expect(
        staking.connect(alice).stake(tokenId, 100n, 60 * 86400),
      ).to.be.revertedWithCustomError(staking, "InvalidLockDuration");

      // Valid duration (14 days)
      await expect(staking.connect(alice).stake(tokenId, 100n, 14 * 86400)).to.emit(
        staking,
        "Staked",
      );
    });

    it("prevents unstaking before lock period has expired", async function () {
      const { staking, alice, tokenId } = await authorizedSetup();
      await staking.connect(alice).stake(tokenId, 100n, 10 * 86400);

      await expect(staking.connect(alice).unstake(tokenId, 100n)).to.be.revertedWithCustomError(
        staking,
        "LockPeriodActive",
      );
    });

    it("allows unstaking after lock period has elapsed and returns tokens to investor", async function () {
      const { token, staking, alice, tokenId } = await authorizedSetup();
      await staking.connect(alice).stake(tokenId, 100n, 100);

      // Fast forward time by 101 seconds
      await ethers.provider.send("evm_increaseTime", [101]);
      await ethers.provider.send("evm_mine", []);

      await expect(staking.connect(alice).unstake(tokenId, 100n))
        .to.emit(staking, "Unstaked")
        .withArgs(tokenId, alice.address, 100n);

      expect(await token.balanceOf(alice.address, tokenId)).to.equal(500n);
      expect(await token.balanceOf(await staking.getAddress(), tokenId)).to.equal(0n);

      const info = await staking.getStakeInfo(tokenId, alice.address);
      expect(info.amount).to.equal(0n);
      expect(info.isLocked).to.equal(false);
    });

    it("rejects unstaking more units than the staked balance", async function () {
      const { staking, alice, tokenId } = await authorizedSetup();
      await staking.connect(alice).stake(tokenId, 50n, 0);

      await expect(staking.connect(alice).unstake(tokenId, 100n))
        .to.be.revertedWithCustomError(staking, "InsufficientStakedBalance")
        .withArgs(50n, 100n);
    });
  });

  describe("Reward Funding & Payout Accounting", function () {
    async function authorizedSetup() {
      const ctx = await setup();
      await ctx.token
        .connect(ctx.compliance)
        .setInvestorEligibility(await ctx.staking.getAddress(), true);
      await ctx.token.connect(ctx.compliance).setTransfersEnabled(ctx.tokenId, true);
      await ctx.token.connect(ctx.alice).setApprovalForAll(await ctx.staking.getAddress(), true);
      await ctx.token.connect(ctx.bob).setApprovalForAll(await ctx.staking.getAddress(), true);
      return ctx;
    }

    it("rejects reward funding by non-distributor accounts", async function () {
      const { staking, outsider, tokenId } = await authorizedSetup();
      await expect(
        staking.connect(outsider).fundRewards(tokenId, { value: ethers.parseEther("1.0") }),
      ).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("distributes funded rewards strictly proportional to staked units", async function () {
      const { staking, distributor, alice, bob, tokenId } = await authorizedSetup();

      // Alice stakes 300 units (75%), Bob stakes 100 units (25%) -> Total = 400 units
      await staking.connect(alice).stake(tokenId, 300n, 0);
      await staking.connect(bob).stake(tokenId, 100n, 0);

      // Distributor funds 4.0 MST in rewards
      const fundAmount = ethers.parseEther("4.0");
      const expectedAccPerToken = (fundAmount * 10n ** 18n) / 400n; // 1e34
      await expect(staking.connect(distributor).fundRewards(tokenId, { value: fundAmount }))
        .to.emit(staking, "RewardsFunded")
        .withArgs(tokenId, distributor.address, fundAmount, expectedAccPerToken);

      // Check pending rewards
      const alicePending = await staking.getPendingRewards(tokenId, alice.address);
      const bobPending = await staking.getPendingRewards(tokenId, bob.address);

      // Alice should have 3.0 MST (75%), Bob should have 1.0 MST (25%)
      expect(alicePending).to.equal(ethers.parseEther("3.0"));
      expect(bobPending).to.equal(ethers.parseEther("1.0"));

      // Alice claims rewards
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await staking.connect(alice).claimRewards(tokenId);
      const receipt = await tx.wait();
      const gasSpent = receipt!.gasUsed * receipt!.gasPrice;
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);

      expect(aliceBalanceAfter + gasSpent - aliceBalanceBefore).to.equal(ethers.parseEther("3.0"));

      // Alice pending is now 0
      expect(await staking.getPendingRewards(tokenId, alice.address)).to.equal(0n);
      // Double claim reverts with NoPendingRewards
      await expect(staking.connect(alice).claimRewards(tokenId)).to.be.revertedWithCustomError(
        staking,
        "NoPendingRewards",
      );
    });

    it("buffers rewards funded before any stakers deposit", async function () {
      const { staking, distributor, alice, tokenId } = await authorizedSetup();

      // Fund 2.0 MST when pool has 0 stakers
      await staking.connect(distributor).fundRewards(tokenId, { value: ethers.parseEther("2.0") });

      // Alice stakes 100 units
      await staking.connect(alice).stake(tokenId, 100n, 0);

      // Buffer should be flushed to Alice
      expect(await staking.getPendingRewards(tokenId, alice.address)).to.equal(
        ethers.parseEther("2.0"),
      );
    });
  });

  describe("Emergency Protections & Access Control", function () {
    async function authorizedSetup() {
      const ctx = await setup();
      await ctx.token
        .connect(ctx.compliance)
        .setInvestorEligibility(await ctx.staking.getAddress(), true);
      await ctx.token.connect(ctx.compliance).setTransfersEnabled(ctx.tokenId, true);
      await ctx.token.connect(ctx.alice).setApprovalForAll(await ctx.staking.getAddress(), true);
      return ctx;
    }

    it("pauses and blocks normal staking and unstaking operations", async function () {
      const { staking, pauser, alice, tokenId } = await authorizedSetup();
      await staking.connect(pauser).pause();

      await expect(staking.connect(alice).stake(tokenId, 100n, 0)).to.be.revertedWithCustomError(
        staking,
        "EnforcedPause",
      );

      await staking.connect(pauser).unpause();
      await expect(staking.connect(alice).stake(tokenId, 100n, 0)).to.emit(staking, "Staked");
    });

    it("allows emergency withdrawal of 100% principal even when paused and locked", async function () {
      const { token, staking, pauser, alice, tokenId } = await authorizedSetup();
      // Alice stakes with a 365-day lock
      await staking.connect(alice).stake(tokenId, 200n, 365 * 86400);

      // Contract is paused due to emergency
      await staking.connect(pauser).pause();

      // Normal unstake reverts because of pause and lock
      await expect(staking.connect(alice).unstake(tokenId, 200n)).to.be.revertedWithCustomError(
        staking,
        "EnforcedPause",
      );

      // Emergency withdraw succeeds, returning all 200 units to Alice
      await expect(staking.connect(alice).emergencyWithdraw(tokenId))
        .to.emit(staking, "EmergencyWithdrawn")
        .withArgs(tokenId, alice.address, 200n);

      expect(await token.balanceOf(alice.address, tokenId)).to.equal(500n);
      expect(await token.balanceOf(await staking.getAddress(), tokenId)).to.equal(0n);
    });

    it("rejects unauthorized pause triggers", async function () {
      const { staking, outsider } = await authorizedSetup();
      await expect(staking.connect(outsider).pause()).to.be.revertedWithCustomError(
        staking,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("Simulated Testnet Demonstration & 0-Day Lock Lifecycle", function () {
    it("proves end-to-end 10 demo units stake and immediate unstake with transfers disabled", async function () {
      const [admin, issuer, compliance, investorAlice, investorBob] = await ethers.getSigners();

      // 1. Deploy PropertyToken
      const token = await ethers.deployContract("PropertyToken", [admin.address]);
      await token.waitForDeployment();
      await token.grantRole(await token.ISSUER_ROLE(), issuer.address);
      await token.grantRole(await token.COMPLIANCE_ROLE(), compliance.address);

      // 2. Deploy Staking Contract
      const staking = await ethers.deployContract("PropertyTokenStaking", [
        await token.getAddress(),
        admin.address,
      ]);
      await staking.waitForDeployment();
      const stakingAddress = await staking.getAddress();

      // 3. Register Simulated Demo Property PRP-TEST-SIM-001 (100 units max, empty hash placeholder)
      const simRef = ethers.id("PRP-TEST-SIM-001");
      const emptyHash = "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      await token
        .connect(issuer)
        .registerProperty(
          simRef,
          emptyHash,
          100n,
          100000n,
          "https://tokenestate.mst/metadata/simulated-prp-test-001.json",
        );
      const tokenId = await token.tokenIdByPropertyRef(simRef);

      // 4. Whitelist demo investor and issue exactly 10 units
      await token.connect(compliance).setInvestorEligibility(investorAlice.address, true);
      await token.connect(compliance).setInvestorEligibility(investorBob.address, true);
      await token.connect(issuer).issueUnits(tokenId, investorAlice.address, 10n);

      expect(await token.balanceOf(investorAlice.address, tokenId)).to.equal(10n);

      // 5. Verify transfersEnabled remains false
      const prop = await token.getProperty(tokenId);
      expect(prop.transfersEnabled).to.equal(false);

      // 6. Ordinary investor-to-investor transfer is strictly blocked
      await expect(
        token
          .connect(investorAlice)
          .safeTransferFrom(investorAlice.address, investorBob.address, tokenId, 1n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");

      // 7. Compliance authorises staking contract
      await token.connect(compliance).setInvestorEligibility(stakingAddress, true);
      await token.connect(compliance).setStakingContractAuthorization(stakingAddress, true);

      // 8. Configure staking pool with zero-day lock (minLock: 0, maxLock: 365 days, isEnabled: true)
      await staking.connect(admin).configurePool(tokenId, 0, 365 * 86400, true);
      const poolCfg = await staking.poolConfigs(tokenId);
      expect(poolCfg.isEnabled).to.equal(true);
      expect(poolCfg.minLockDuration).to.equal(0n);

      // 9. Demo investor approves staking contract and deposits all 10 units with 0-day lock
      await token.connect(investorAlice).setApprovalForAll(stakingAddress, true);
      await expect(staking.connect(investorAlice).stake(tokenId, 10n, 0))
        .to.emit(staking, "Staked")
        .withArgs(
          tokenId,
          investorAlice.address,
          10n,
          (await ethers.provider.getBlock("latest"))!.timestamp + 1,
        );

      // Contract holds all 10 units; investor balance is 0
      expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(10n);
      expect(await token.balanceOf(investorAlice.address, tokenId)).to.equal(0n);

      // 10. Investor immediately unstakes all 10 units without waiting
      await expect(staking.connect(investorAlice).unstake(tokenId, 10n))
        .to.emit(staking, "Unstaked")
        .withArgs(tokenId, investorAlice.address, 10n);

      // Investor has all 10 units back; staking contract holds 0
      expect(await token.balanceOf(investorAlice.address, tokenId)).to.equal(10n);
      expect(await token.balanceOf(stakingAddress, tokenId)).to.equal(0n);

      // 11. Peer-to-peer transfers remain blocked
      await expect(
        token
          .connect(investorAlice)
          .safeTransferFrom(investorAlice.address, investorBob.address, tokenId, 5n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");
    });
  });
});
