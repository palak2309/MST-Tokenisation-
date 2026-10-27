import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.create();

describe("PropertyDocumentRegistry", function () {
  async function deployRegistry() {
    const registry = await ethers.deployContract("PropertyDocumentRegistry");
    await registry.waitForDeployment();
    return registry;
  }

  it("registers a valid property ID and nonzero document hash", async function () {
    const registry = await deployRegistry();
    const propertyId = "PROPERTY-001";
    const docHash = ethers.id("document contents");

    await expect(
      registry.registerDocument(propertyId, docHash),
    ).to.emit(registry, "DocumentRegistered");
  });

  it("rejects an empty property ID", async function () {
    const registry = await deployRegistry();

    await expect(
      registry.registerDocument("", ethers.id("document contents")),
    ).to.be.revertedWith("invalid propertyId");
  });

  it("rejects property IDs longer than 64 UTF-8 bytes", async function () {
    const registry = await deployRegistry();
    const propertyId = "é".repeat(33);

    await expect(
      registry.registerDocument(propertyId, ethers.id("document contents")),
    ).to.be.revertedWith("invalid propertyId");
  });

  it("rejects a zero document hash", async function () {
    const registry = await deployRegistry();

    await expect(
      registry.registerDocument("PROPERTY-001", ethers.ZeroHash),
    ).to.be.revertedWith("invalid hash");
  });

  it("rejects duplicate registration of the same property ID and hash", async function () {
    const registry = await deployRegistry();
    const propertyId = "PROPERTY-001";
    const docHash = ethers.id("document contents");

    await registry.registerDocument(propertyId, docHash);

    await expect(
      registry.registerDocument(propertyId, docHash),
    ).to.be.revertedWith("already registered");
  });

  it("returns the submitter and registration timestamp for a registered record", async function () {
    const registry = await deployRegistry();
    const [submitter] = await ethers.getSigners();
    const propertyId = "PROPERTY-001";
    const docHash = ethers.id("document contents");
    const receipt = await (
      await registry.registerDocument(propertyId, docHash)
    ).wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    const record = await registry.getRecord(propertyId, docHash);

    expect(record.submitter).to.equal(submitter.address);
    expect(record.timestamp).to.equal(BigInt(block.timestamp));
  });

  it("returns zero values for an unregistered property ID and hash", async function () {
    const registry = await deployRegistry();

    const record = await registry.getRecord(
      "PROPERTY-UNKNOWN",
      ethers.id("unregistered document"),
    );

    expect(record.submitter).to.equal(ethers.ZeroAddress);
    expect(record.timestamp).to.equal(0n);
  });

  it("allows different hashes to be registered for the same property ID", async function () {
    const registry = await deployRegistry();
    const propertyId = "PROPERTY-001";
    const firstHash = ethers.id("first document");
    const secondHash = ethers.id("second document");

    await registry.registerDocument(propertyId, firstHash);
    await registry.registerDocument(propertyId, secondHash);

    const firstRecord = await registry.getRecord(propertyId, firstHash);
    const secondRecord = await registry.getRecord(propertyId, secondHash);

    expect(firstRecord.submitter).to.equal((await ethers.getSigners())[0].address);
    expect(firstRecord.timestamp > 0n).to.equal(true);
    expect(secondRecord.submitter).to.equal((await ethers.getSigners())[0].address);
    expect(secondRecord.timestamp > 0n).to.equal(true);
  });
});
