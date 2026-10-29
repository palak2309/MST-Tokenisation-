import { expect } from "chai";
import hre from "hardhat";
import { allocateRental, AllocationLedger } from "../src/lib/rentalAllocation.ts";

const { ethers } = await hre.network.create();

const REF = ethers.id("PRP-PUN-0142");
const DOC = ethers.sha256(ethers.toUtf8Bytes("approved tokenisation bundle"));

describe("PropertyToken", function () {
  async function setup() {
    const [admin, issuer, compliance, pauser, alice, bob, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("PropertyToken", [admin.address]);
    await token.waitForDeployment();
    await token.grantRole(await token.ISSUER_ROLE(), issuer.address);
    await token.grantRole(await token.COMPLIANCE_ROLE(), compliance.address);
    await token.grantRole(await token.PAUSER_ROLE(), pauser.address);
    await token.connect(compliance).setInvestorEligibility(alice.address, true);
    await token.connect(compliance).setInvestorEligibility(bob.address, true);
    return { token, admin, issuer, compliance, pauser, alice, bob, outsider };
  }

  async function withProperty(maxSupply = 1000n) {
    const ctx = await setup();
    await ctx.token
      .connect(ctx.issuer)
      .registerProperty(REF, DOC, maxSupply, 125000n, "ipfs://meta/1");
    return ctx;
  }

  describe("registration", function () {
    it("registers a property with token ID 1 and emits PropertyRegistered", async function () {
      const { token, issuer } = await setup();
      await expect(
        token.connect(issuer).registerProperty(REF, DOC, 1000n, 125000n, "ipfs://meta/1"),
      )
        .to.emit(token, "PropertyRegistered")
        .withArgs(1n, REF, DOC, 1000n, 125000n, "ipfs://meta/1");
      const p = await token.getProperty(1n);
      expect(p.maxSupply).to.equal(1000n);
      expect(p.transfersEnabled).to.equal(false);
      expect(await token.tokenIdByPropertyRef(REF)).to.equal(1n);
    });

    it("rejects duplicate registration of the same property", async function () {
      const { token, issuer } = await withProperty();
      await expect(token.connect(issuer).registerProperty(REF, DOC, 10n, 1n, ""))
        .to.be.revertedWithCustomError(token, "PropertyAlreadyRegistered")
        .withArgs(1n);
    });

    it("rejects zero property ref, zero document hash and zero max supply", async function () {
      const { token, issuer } = await setup();
      await expect(
        token.connect(issuer).registerProperty(ethers.ZeroHash, DOC, 1n, 1n, ""),
      ).to.be.revertedWithCustomError(token, "InvalidPropertyRef");
      await expect(
        token.connect(issuer).registerProperty(REF, ethers.ZeroHash, 1n, 1n, ""),
      ).to.be.revertedWithCustomError(token, "InvalidDocumentHash");
      await expect(
        token.connect(issuer).registerProperty(REF, DOC, 0n, 1n, ""),
      ).to.be.revertedWithCustomError(token, "InvalidMaxSupply");
    });

    it("rejects registration by an account without ISSUER_ROLE", async function () {
      const { token, outsider } = await setup();
      await expect(
        token.connect(outsider).registerProperty(REF, DOC, 1n, 1n, ""),
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("issuance", function () {
    it("lets an issuer mint to an eligible investor and tracks balance and supply", async function () {
      const { token, issuer, alice } = await withProperty();
      await expect(token.connect(issuer).issueUnits(1n, alice.address, 250n))
        .to.emit(token, "UnitsIssued")
        .withArgs(1n, alice.address, 250n, issuer.address);
      expect(await token.balanceOf(alice.address, 1n)).to.equal(250n);
      expect(await token["totalSupply(uint256)"](1n)).to.equal(250n);
      expect(await token.remainingSupply(1n)).to.equal(750n);
    });

    it("rejects issuance by an unauthorised account", async function () {
      const { token, outsider, alice } = await withProperty();
      await expect(
        token.connect(outsider).issueUnits(1n, alice.address, 1n),
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("rejects zero amount, zero address, ineligible recipient and unknown token", async function () {
      const { token, issuer, alice, outsider } = await withProperty();
      await expect(
        token.connect(issuer).issueUnits(1n, alice.address, 0n),
      ).to.be.revertedWithCustomError(token, "ZeroAmount");
      await expect(
        token.connect(issuer).issueUnits(1n, ethers.ZeroAddress, 1n),
      ).to.be.revertedWithCustomError(token, "InvalidRecipient");
      await expect(
        token.connect(issuer).issueUnits(1n, outsider.address, 1n),
      ).to.be.revertedWithCustomError(token, "IneligibleInvestor");
      await expect(
        token.connect(issuer).issueUnits(99n, alice.address, 1n),
      ).to.be.revertedWithCustomError(token, "UnknownToken");
    });

    it("rejects recipient if recipient is the contract itself", async function () {
      const { token, issuer } = await withProperty();
      const tokenAddress = await token.getAddress();
      await expect(token.connect(issuer).issueUnits(1n, tokenAddress, 10n))
        .to.be.revertedWithCustomError(token, "InvalidRecipient")
        .withArgs(tokenAddress);
    });

    it("rejects constructor initialization with zero admin address", async function () {
      const factory = await ethers.getContractFactory("PropertyToken");
      await expect(factory.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "InvalidRecipient")
        .withArgs(ethers.ZeroAddress);
    });

    it("enforces the maximum supply cap exactly", async function () {
      const { token, issuer, alice, bob } = await withProperty(100n);
      await token.connect(issuer).issueUnits(1n, alice.address, 60n);
      await expect(token.connect(issuer).issueUnits(1n, bob.address, 41n))
        .to.be.revertedWithCustomError(token, "SupplyCapExceeded")
        .withArgs(1n, 41n, 40n);
      await token.connect(issuer).issueUnits(1n, bob.address, 40n);
      expect(await token.remainingSupply(1n)).to.equal(0n);
      await expect(
        token.connect(issuer).issueUnits(1n, bob.address, 1n),
      ).to.be.revertedWithCustomError(token, "SupplyCapExceeded");
    });
  });

  describe("transfers and compliance", function () {
    it("blocks transfers until compliance enables them for the token", async function () {
      const { token, issuer, compliance, alice, bob } = await withProperty();
      await token.connect(issuer).issueUnits(1n, alice.address, 100n);
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 10n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransfersDisabled");
      await expect(token.connect(compliance).setTransfersEnabled(1n, true))
        .to.emit(token, "TransfersEnabledUpdated")
        .withArgs(1n, true, compliance.address);
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 10n, "0x"),
      ).to.emit(token, "TransferSingle");
      expect(await token.balanceOf(alice.address, 1n)).to.equal(90n);
      expect(await token.balanceOf(bob.address, 1n)).to.equal(10n);
    });

    it("blocks transfers to an ineligible recipient even when transfers are enabled", async function () {
      const { token, issuer, compliance, alice, outsider } = await withProperty();
      await token.connect(issuer).issueUnits(1n, alice.address, 100n);
      await token.connect(compliance).setTransfersEnabled(1n, true);
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, outsider.address, 1n, 1n, "0x"),
      )
        .to.be.revertedWithCustomError(token, "IneligibleInvestor")
        .withArgs(outsider.address);
    });

    it("only COMPLIANCE_ROLE can change eligibility or transfer settings", async function () {
      const { token, outsider, alice } = await withProperty();
      await expect(
        token.connect(outsider).setInvestorEligibility(alice.address, false),
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await expect(
        token.connect(outsider).setTransfersEnabled(1n, true),
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("an account cannot grant itself a role", async function () {
      const { token, outsider } = await setup();
      await expect(
        token.connect(outsider).grantRole(await token.ISSUER_ROLE(), outsider.address),
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });
  });

  describe("pause", function () {
    it("pauser can pause; registration, issuance and transfers then revert", async function () {
      const { token, issuer, compliance, pauser, alice, bob } = await withProperty();
      await token.connect(issuer).issueUnits(1n, alice.address, 10n);
      await token.connect(compliance).setTransfersEnabled(1n, true);
      await expect(token.connect(pauser).pause()).to.emit(token, "Paused");
      await expect(
        token.connect(issuer).issueUnits(1n, alice.address, 1n),
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(
        token.connect(issuer).registerProperty(ethers.id("X"), DOC, 1n, 1n, ""),
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x"),
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      await token.connect(pauser).unpause();
      await token.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 1n, "0x");
      expect(await token.balanceOf(bob.address, 1n)).to.equal(1n);
    });

    it("non-pauser cannot pause", async function () {
      const { token, outsider } = await setup();
      await expect(token.connect(outsider).pause()).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("rental allocation from on-chain balances at a record block", function () {
    it("uses balances at the record block, not later ones", async function () {
      const { token, issuer, compliance, alice, bob } = await withProperty();
      await token.connect(issuer).issueUnits(1n, alice.address, 300n);
      await token.connect(issuer).issueUnits(1n, bob.address, 100n);
      const recordBlock = BigInt(await ethers.provider.getBlockNumber());
      // Later transfer must not affect this period's allocation.
      await token.connect(compliance).setTransfersEnabled(1n, true);
      await token.connect(alice).safeTransferFrom(alice.address, bob.address, 1n, 200n, "0x");

      const at = { blockTag: Number(recordBlock) };
      const holdings = [
        { holder: alice.address, units: await token.balanceOf(alice.address, 1n, at) },
        { holder: bob.address, units: await token.balanceOf(bob.address, 1n, at) },
      ];
      const result = allocateRental({
        tokenId: 1n,
        periodId: "2026-10",
        recordBlock,
        amount: 1001n,
        holdings,
      });
      expect(result.totalEligibleUnits).to.equal(400n);
      const byHolder = Object.fromEntries(result.shares.map((s) => [s.holder, s.amount]));
      expect(byHolder[alice.address.toLowerCase()]).to.equal(750n); // floor(1001*300/400)
      expect(byHolder[bob.address.toLowerCase()]).to.equal(250n); // floor(1001*100/400)
      expect(result.residual).to.equal(1n);
    });
  });
});

describe("Rental allocation algorithm", function () {
  it("rounds down and reports the residual", function () {
    const r = allocateRental({
      tokenId: 1n,
      periodId: "p1",
      recordBlock: 1n,
      amount: 100n,
      holdings: [
        { holder: "0xA", units: 1n },
        { holder: "0xB", units: 1n },
        { holder: "0xC", units: 1n },
      ],
    });
    expect(r.shares.map((s) => s.amount)).to.deep.equal([33n, 33n, 33n]);
    expect(r.allocated).to.equal(99n);
    expect(r.residual).to.equal(1n);
  });

  it("excludes zero balances and excluded holders", function () {
    const r = allocateRental({
      tokenId: 1n,
      periodId: "p1",
      recordBlock: 1n,
      amount: 1000n,
      holdings: [
        { holder: "0xA", units: 0n },
        { holder: "0xB", units: 10n },
        { holder: "0xT", units: 90n },
      ],
      excludedHolders: ["0xt"],
    });
    expect(r.totalEligibleUnits).to.equal(10n);
    expect(r.shares).to.have.length(1);
    expect(r.shares[0]!.amount).to.equal(1000n);
    expect(r.residual).to.equal(0n);
  });

  it("allocates nothing when there are no eligible units", function () {
    const r = allocateRental({
      tokenId: 1n,
      periodId: "p1",
      recordBlock: 1n,
      amount: 500n,
      holdings: [],
    });
    expect(r.shares).to.have.length(0);
    expect(r.residual).to.equal(500n);
  });

  it("prevents allocating the same period twice", function () {
    const ledger = new AllocationLedger();
    const input = {
      tokenId: 1n,
      periodId: "2026-10",
      recordBlock: 1n,
      amount: 10n,
      holdings: [{ holder: "0xA", units: 1n }],
    };
    ledger.record(input);
    expect(() => ledger.record(input)).to.throw("already allocated");
    expect(() => ledger.record({ ...input, periodId: "2026-11" })).to.not.throw();
  });

  it("tracks unclaimed amounts and blocks double claims", function () {
    const ledger = new AllocationLedger();
    ledger.record({
      tokenId: 1n,
      periodId: "p1",
      recordBlock: 1n,
      amount: 100n,
      holdings: [
        { holder: "0xA", units: 3n },
        { holder: "0xB", units: 1n },
      ],
    });
    expect(ledger.unclaimed(1n, "p1")).to.equal(100n);
    expect(ledger.markClaimed(1n, "p1", "0xA")).to.equal(75n);
    expect(() => ledger.markClaimed(1n, "p1", "0xA")).to.throw("already claimed");
    expect(ledger.unclaimed(1n, "p1")).to.equal(25n);
    expect(() => ledger.markClaimed(1n, "p1", "0xZ")).to.throw("nothing owed");
  });
});
