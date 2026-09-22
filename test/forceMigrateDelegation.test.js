const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * Sepolia Fork Tests: forceMigrateDelegation / forceMigrateMultipleDelegations
 *
 * Self-contained: runs against the latest Sepolia block (no archive node needed).
 * Creates fresh delegators on validator 3, force-unstakes validator 3 and
 * migrates them to validator 5, covering the success path, per-delegator
 * failure isolation and the input validation guards.
 *
 * Run with:
 *   FORK_SEPOLIA=true SEPOLIA_RPC_URL=<rpc> npx hardhat test test/forceMigrateDelegation.test.js
 */

const STAKE_MANAGER_PROXY = "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a";
const BONE_TOKEN          = "0xcA94c8B16209CCBAfCFeab9D7649DdaEcD444007";

const VAL_CLOSE    = 3;
const VAL_TARGET   = 5;
const VAL_INACTIVE = 7;
const ETH_100      = "0x56BC75E2D63100000";
const DELEGATION   = ethers.parseUnits("100", 18);
// migrateOut rounds shares down, so a few wei of dust can remain on the source
const DUST_WEI     = 1000n;

async function impersonate(addr) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
  await network.provider.send("hardhat_setBalance", [addr, ETH_100]);
  return ethers.getSigner(addr);
}

// StakeManager.owner() through the proxy returns the *proxy* owner, so read Ownable._owner (slot 1) directly
async function readStakeManagerOwner() {
  const raw = await ethers.provider.getStorage(STAKE_MANAGER_PROXY, 1);
  return ethers.getAddress("0x" + raw.slice(-40));
}

async function readGovernance() {
  // slot 0 packs Lockable.locked (1 byte) with Governable.governance
  const raw = await ethers.provider.getStorage(STAKE_MANAGER_PROXY, 0);
  return ethers.getAddress("0x" + raw.slice(-42, -2));
}

describe("forceMigrateDelegation — Sepolia Fork", function () {
  this.timeout(300000);

  let stakeManager, bone, fromVS, toVS;
  let owner, governance, stranger;
  let d1, d2, dExiting;
  const noStake = ethers.Wallet.createRandom().address;

  before(async function () {
    if (process.env.FORK_SEPOLIA !== "true") {
      console.log("⚠️  Skipping. Set FORK_SEPOLIA=true to run these tests.");
      this.skip();
    }

    stakeManager = await ethers.getContractAt("StakeManager", STAKE_MANAGER_PROXY);
    bone = await ethers.getContractAt("IERC20", BONE_TOKEN);

    owner      = await impersonate(await readStakeManagerOwner());
    governance = await impersonate(await readGovernance());
    [stranger] = await ethers.getSigners();

    // ── Upgrade to the new implementation ─────────────────────────────────────
    const proxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY);
    const proxyOwner = await impersonate(await proxy.owner());
    const newImpl = await (await ethers.getContractFactory("StakeManager")).deploy();
    await newImpl.waitForDeployment();
    await (await proxy.connect(proxyOwner).updateImplementation(await newImpl.getAddress())).wait();

    fromVS = await ethers.getContractAt("ValidatorShare", (await stakeManager.validators(VAL_CLOSE)).contractAddress);
    toVS   = await ethers.getContractAt("ValidatorShare", (await stakeManager.validators(VAL_TARGET)).contractAddress);

    // ── Create delegators on the validator being closed ───────────────────────
    const funder = await impersonate(STAKE_MANAGER_PROXY);
    const delegators = [];
    for (let i = 0; i < 3; i++) {
      const w = ethers.Wallet.createRandom().connect(ethers.provider);
      await network.provider.send("hardhat_setBalance", [w.address, ETH_100]);
      await (await bone.connect(funder).transfer(w.address, DELEGATION * 2n)).wait();
      await (await bone.connect(w).approve(STAKE_MANAGER_PROXY, DELEGATION * 2n)).wait();
      await (await fromVS.connect(w).buyVoucher(DELEGATION, 0)).wait();
      delegators.push(w);
    }
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [STAKE_MANAGER_PROXY] });
    [d1, d2, dExiting] = delegators;

    // dExiting has a legacy unbond on the target, so migrateIn reverts with "Ongoing exit"
    await (await toVS.connect(dExiting).buyVoucher(DELEGATION, 0)).wait();
    await (await toVS.connect(dExiting).sellVoucher(DELEGATION / 2n, ethers.MaxUint256)).wait();

    await (await stakeManager.connect(governance).forceUnstake(VAL_CLOSE)).wait();
    expect(await stakeManager.isValidator(VAL_CLOSE)).to.be.false;
  });

  describe("guards", function () {
    it("reverts for non-owner", async function () {
      await expect(
        stakeManager.connect(stranger).forceMigrateMultipleDelegations(VAL_CLOSE, VAL_TARGET, [d1.address])
      ).to.be.reverted;
      await expect(
        stakeManager.connect(stranger).forceMigrateDelegation(VAL_CLOSE, VAL_TARGET, d1.address)
      ).to.be.reverted;
    });

    it("reverts when source and target are the same", async function () {
      await expect(
        stakeManager.connect(owner).forceMigrateMultipleDelegations(VAL_TARGET, VAL_TARGET, [d1.address])
      ).to.be.revertedWith("Invalid migration");
    });

    it("reverts when target validator is not active", async function () {
      await expect(
        stakeManager.connect(owner).forceMigrateMultipleDelegations(VAL_CLOSE, VAL_INACTIVE, [d1.address])
      ).to.be.revertedWith("Invalid migration");
    });

    it("forceMigrateDelegationSelf is not callable externally, even by owner", async function () {
      await expect(
        stakeManager.connect(owner).forceMigrateDelegationSelf(VAL_CLOSE, VAL_TARGET, d1.address)
      ).to.be.reverted;
    });

    it("single migration reverts for a delegator with no stake", async function () {
      await expect(
        stakeManager.connect(owner).forceMigrateDelegation(VAL_CLOSE, VAL_TARGET, noStake)
      ).to.be.revertedWith("No stake");
    });
  });

  describe("batch migration", function () {
    let before1, before2, beforeExiting, targetDelegatedBefore, receipt;

    before(async function () {
      [before1] = await fromVS.getTotalStake(d1.address);
      [before2] = await fromVS.getTotalStake(d2.address);
      [beforeExiting] = await fromVS.getTotalStake(dExiting.address);
      targetDelegatedBefore = (await stakeManager.validators(VAL_TARGET)).delegatedAmount;

      const tx = await stakeManager.connect(owner).forceMigrateMultipleDelegations(
        VAL_CLOSE, VAL_TARGET, [d1.address, noStake, dExiting.address, d2.address]
      );
      receipt = await tx.wait();
    });

    function eventsNamed(name) {
      return receipt.logs
        .map((l) => { try { return stakeManager.interface.parseLog(l); } catch (_) { return null; } })
        .filter((e) => e && e.name === name);
    }

    it("emits DelegationForceMigrated for each migrated delegator only", async function () {
      const migrated = eventsNamed("DelegationForceMigrated");
      expect(migrated.map((e) => e.args.delegator)).to.deep.equal([d1.address, d2.address]);
      expect(migrated[0].args.amount).to.equal(before1);
      expect(migrated[1].args.amount).to.equal(before2);
    });

    it("emits DelegationForceMigrationFailed for the failing delegator without reverting the batch", async function () {
      const failed = eventsNamed("DelegationForceMigrationFailed");
      expect(failed.length).to.equal(1);
      expect(failed[0].args.delegator).to.equal(dExiting.address);
      const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], ethers.dataSlice(failed[0].args.reason, 4))[0];
      expect(reason).to.equal("Ongoing exit");
    });

    it("clears migrated delegators from the source (up to rounding dust)", async function () {
      for (const d of [d1, d2]) {
        const [stake] = await fromVS.getTotalStake(d.address);
        expect(stake).to.be.lte(DUST_WEI);
      }
    });

    it("leaves the failing delegator's stake untouched on the source", async function () {
      const [stake] = await fromVS.getTotalStake(dExiting.address);
      expect(stake).to.equal(beforeExiting);
    });

    it("credits migrated stake on the target", async function () {
      const [s1] = await toVS.getTotalStake(d1.address);
      const [s2] = await toVS.getTotalStake(d2.address);
      expect(s1).to.be.closeTo(before1, DUST_WEI);
      expect(s2).to.be.closeTo(before2, DUST_WEI);

      const targetDelegatedAfter = (await stakeManager.validators(VAL_TARGET)).delegatedAmount;
      expect(targetDelegatedAfter - targetDelegatedBefore).to.be.closeTo(before1 + before2, DUST_WEI);
    });
  });
});
