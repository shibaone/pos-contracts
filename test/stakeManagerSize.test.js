const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");

/**
 * The hardhat test network sets allowUnlimitedContractSize, so tests would still pass with a
 * StakeManager that mainnet refuses to deploy. This checks the compiled runtime against the real
 * EIP-170 limit directly; the build has only a few dozen bytes of headroom.
 */

const EIP170_LIMIT = 24576;

describe("StakeManager contract size", function () {
  it("fits the EIP-170 limit of 24,576 bytes", async function () {
    const artifact = await artifacts.readArtifact("StakeManager");
    const size = (artifact.deployedBytecode.length - 2) / 2;
    console.log(`      runtime ${size} bytes, headroom ${EIP170_LIMIT - size}, codehash ${ethers.keccak256(artifact.deployedBytecode)}`);
    expect(size).to.be.at.most(EIP170_LIMIT);
  });
});
