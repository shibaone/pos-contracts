const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * Sepolia Fork Tests: Validator 7 Closure & Delegation Migration
 *
 * Goal: Close validator 7 and migrate all its delegators to validator 5.
 * End state: 3 active validators (2, 3, 5) instead of 4.
 *
 * Steps:
 *   1. Deploy new StakeManager implementation (adds forceMigrate functions)
 *   2. Upgrade proxy to new implementation
 *   3. forceUnstake(7) via governance
 *   4. forceMigrateMultipleDelegations(7 → 5) for all active delegators
 *   5. Verify final state
 *
 * Validator 7 was already migrated on live Sepolia, so this must fork a block
 * from before the migration, which needs an archive RPC:
 *   FORK_SEPOLIA=true SEPOLIA_RPC_URL=<archive rpc> FORK_BLOCK_NUMBER=<block> \
 *     npx hardhat test test/validatorMigrationPuppynet.test.js
 *
 * For a self-contained test at the latest block see forceMigrateDelegation.test.js
 */

const ADDRESSES = {
  StakeManagerProxy:  "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a",
  ProxyOwner:         "0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B",
  Governance:         "0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC",
  BoneToken:          "0xcA94c8B16209CCBAfCFeab9D7649DdaEcD444007",
  StakingNFT:         "0x76033046A292e53b96c77C574FEA36450fFBdA0F",

  // Validator owners
  ValidatorOwner7:    "0x50DF88bd50F4e984d4a0f7D5837908Dc8660C33A",
  ValidatorOwner5:    "0x943CfeE13e0eae2b2e055C0b5D9aA52ad7babBe7",

  // Validator 7 delegation contract
  ValidatorShare7:    "0x4CfD58fAFD8bEc3cDE633DcEad7BC32E1857A851",
  // Validator 5 delegation contract
  ValidatorShare5:    "0xE42f3F040Be2edE88888BeF85762Aff022cAb7Ef",

  // Active delegators of validator 7 (full on-chain scan — 19 addresses)
  DelegatorsOfVal7: [
    "0xECB219888df5Be687407F8341a255d5E2c4c2F23",  //    ~12 BONE
    "0x263c3Cd4aBD410eD958F5a7A81c603a3a61cB066",  //    ~57 BONE
    "0xE4A3D282247ef1c38e2dbC5ed82Bcf106A7F798D",  //    ~31 BONE
    "0x8b7043FEEDC67C5ba82Ef35C9c2CDC6D34188371",  //     ~1 BONE
    "0xCb38B1e3328d52Bc2c6794c481cB1aebc0556282",  //  ~5170 BONE
    "0x2b89ca99dB1bdbe1bEb9321d877ecA37961Fe52a",  //     ~1 BONE
    "0x5C6cbd6927408ffe9dC9DB433Ea13E86869B09AC",  //    ~21 BONE
    "0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B",  //  ~0.07 BONE
    "0x08b9F5FDb8aBDF42e9A23A96ee333d6B9b594A86",  //     ~1 BONE
    "0x1047C147772e81C9054d66a7CDCAbb5a1f9d3AAf",  //    ~15 BONE
    "0x065E6324859881376c4331c98BeE8572F2a948F2",  //   tiny BONE
    "0xE15940DC4ABF1fB3deB1E24E0E9505CcEE22D5C9",  //     ~1 BONE
    "0xb669777b9D69957B33f3CF3cCAb2B6aFCaC818fB",  //   ~148 BONE
    "0xCfB73595c389995dA02693CD76c3B155a862807A",  //   ~5.5 BONE
    "0xCF1177e9f54eE20C6E80570D678462363d56C1E5",  //   ~321 BONE
    "0x439C20c0DD0188f336Ae69132A7FBc88B6344564",  //     ~9 BONE
    "0x387450a9cB6fBD3482078e20294422948Ca08bC8",  //  ~0.07 BONE
    "0xa8Dd7Ce13CfBF36a76a9981e798c15CEcA9c3c40",  //     ~5 BONE
    "0x3F3904354c22755d036877363cE06eaA58825952",  //     ~1 BONE
  ],
};

const VAL_CLOSE  = 7;
const VAL_TARGET = 5;
const ETH_100    = "0x56BC75E2D63100000";
// migrateOut rounds shares down, so a few wei of dust can remain on the source
const DUST_WEI   = 1000n;

describe("Validator 7 Closure & Migration — Sepolia Fork", function () {
  this.timeout(300000);

  let stakeManager;
  let validatorShare7;
  let validatorShare5;
  let governance;
  let proxyOwner;
  let stakeManagerOwner;
  let setupComplete = false;

  before(async function () {
    if (process.env.FORK_SEPOLIA !== "true") {
      console.log("⚠️  Skipping. Set FORK_SEPOLIA=true to run these tests.");
      this.skip();
    }

    console.log("\n🚀 Setting up Sepolia fork...\n");

    // ── Impersonate accounts ──────────────────────────────────────────────────
    for (const addr of [ADDRESSES.Governance, ADDRESSES.ProxyOwner]) {
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [addr] });
      await network.provider.send("hardhat_setBalance", [addr, ETH_100]);
    }
    governance  = await ethers.getSigner(ADDRESSES.Governance);
    proxyOwner  = await ethers.getSigner(ADDRESSES.ProxyOwner);

    // forceMigrate* are onlyOwner (Ownable._owner, slot 1) — not governance, and
    // not the proxy owner returned by owner() through the proxy
    const ownerSlot = await ethers.provider.getStorage(ADDRESSES.StakeManagerProxy, 1);
    const ownerAddr = ethers.getAddress("0x" + ownerSlot.slice(-40));
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [ownerAddr] });
    await network.provider.send("hardhat_setBalance", [ownerAddr, ETH_100]);
    stakeManagerOwner = await ethers.getSigner(ownerAddr);

    // ── Attach contracts ──────────────────────────────────────────────────────
    stakeManager   = await ethers.getContractAt("StakeManager",   ADDRESSES.StakeManagerProxy);
    validatorShare7 = await ethers.getContractAt("ValidatorShare", ADDRESSES.ValidatorShare7);
    validatorShare5 = await ethers.getContractAt("ValidatorShare", ADDRESSES.ValidatorShare5);

    // ── Deploy new StakeManager impl with forceMigrate* functions ─────────────
    console.log("🔨 Deploying new StakeManager implementation...");
    const StakeManagerFactory = await ethers.getContractFactory("StakeManager");
    const newImpl = await StakeManagerFactory.connect(proxyOwner).deploy();
    await newImpl.waitForDeployment();
    console.log("   Deployed:", await newImpl.getAddress());

    // ── Upgrade proxy ─────────────────────────────────────────────────────────
    const proxy = await ethers.getContractAt("StakeManagerProxy", ADDRESSES.StakeManagerProxy);
    await (await proxy.connect(proxyOwner).updateImplementation(await newImpl.getAddress())).wait();
    console.log("   Proxy upgraded ✓");

    setupComplete = true;
    console.log("\n✅ Setup complete\n");
  });

  after(async function () {
    if (!setupComplete) return;
    for (const addr of [ADDRESSES.Governance, ADDRESSES.ProxyOwner]) {
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [addr] });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Pre-flight: Confirm initial state
  // ══════════════════════════════════════════════════════════════════════════

  describe("Pre-flight checks", function () {
    it("should have 4 active validators initially", async function () {
      const size = await stakeManager.currentValidatorSetSize();
      expect(size).to.equal(4n);
      console.log("   Active validators:", size.toString());
    });

    it("validator 7 should be active with delegations", async function () {
      expect(await stakeManager.isValidator(VAL_CLOSE)).to.be.true;
      const val7 = await stakeManager.validators(VAL_CLOSE);
      expect(val7.delegatedAmount).to.be.gt(0n);
      console.log("   Val7 delegatedAmount:", ethers.formatUnits(val7.delegatedAmount, 18), "BONE");
    });

    it("all delegators should have active stake in validator 7", async function () {
      for (const d of ADDRESSES.DelegatorsOfVal7) {
        const [stake] = await validatorShare7.getTotalStake(d);
        expect(stake).to.be.gt(0n, `${d} should have stake`);
        console.log("  ", d, "→", ethers.formatUnits(stake, 18), "BONE");
      }
    });

    it("validator 5 should be active", async function () {
      expect(await stakeManager.isValidator(VAL_TARGET)).to.be.true;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Step 1: Force Unstake Validator 7
  // ══════════════════════════════════════════════════════════════════════════

  describe("Step 1 — forceUnstake(7)", function () {
    it("should remove validator 7 from active set", async function () {
      await (await stakeManager.connect(governance).forceUnstake(VAL_CLOSE)).wait();

      expect(await stakeManager.isValidator(VAL_CLOSE)).to.be.false;
      expect(await stakeManager.currentValidatorSetSize()).to.equal(3n);
      console.log("   Validator 7 removed. Active set size: 3");
    });

    it("should set deactivationEpoch on validator 7", async function () {
      const val7 = await stakeManager.validators(VAL_CLOSE);
      expect(val7.deactivationEpoch).to.be.gt(0n);
      console.log("   deactivationEpoch:", val7.deactivationEpoch.toString());
    });

    it("should lock the validator 7 delegation contract", async function () {
      expect(await validatorShare7.locked()).to.be.true;
      console.log("   ValidatorShare7 locked ✓");
    });

    it("should revert if non-governance tries forceUnstake", async function () {
      const [other] = await ethers.getSigners();
      await expect(
        stakeManager.connect(other).forceUnstake(VAL_CLOSE)
      ).to.be.reverted;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2: Migrate All Delegators from Validator 7 → Validator 5
  // ══════════════════════════════════════════════════════════════════════════

  describe("Step 2 — forceMigrateMultipleDelegations(7 → 5)", function () {
    let stakesBefore;

    before(async function () {
      // snapshot stakes before migration
      stakesBefore = await Promise.all(
        ADDRESSES.DelegatorsOfVal7.map(d =>
          validatorShare7.getTotalStake(d).then(([s]) => s)
        )
      );
    });

    it("should migrate all delegators in one call", async function () {
      await (
        await stakeManager.connect(stakeManagerOwner).forceMigrateMultipleDelegations(
          VAL_CLOSE,
          VAL_TARGET,
          ADDRESSES.DelegatorsOfVal7
        )
      ).wait();
      console.log("   forceMigrateMultipleDelegations executed ✓");
    });

    it("should zero out every delegator's stake in validator 7", async function () {
      for (const [i, d] of ADDRESSES.DelegatorsOfVal7.entries()) {
        const [stake] = await validatorShare7.getTotalStake(d);
        expect(stake).to.be.lte(DUST_WEI, `${d} should have no stake left in val7`);
        console.log("  ", d, "val7 stake:", ethers.formatUnits(stake, 18), "| migrated:", ethers.formatUnits(stakesBefore[i], 18), "BONE");
      }
    });

    it("should give every delegator stake in validator 5", async function () {
      for (const [i, d] of ADDRESSES.DelegatorsOfVal7.entries()) {
        if (stakesBefore[i] === 0n) continue;
        const [stake] = await validatorShare5.getTotalStake(d);
        expect(stake).to.be.gt(0n, `${d} should have stake in val5`);
        console.log("  ", d, "val5 stake:", ethers.formatUnits(stake, 18), "BONE");
      }
    });

    it("should increase validator 5 delegatedAmount", async function () {
      const val5 = await stakeManager.validators(VAL_TARGET);
      const totalMigrated = stakesBefore.reduce((a, b) => a + b, 0n);
      expect(val5.delegatedAmount).to.be.gte(totalMigrated);
      console.log("   Val5 delegatedAmount after:", ethers.formatUnits(val5.delegatedAmount, 18), "BONE");
    });

    it("should revert if non-owner tries the migration", async function () {
      const [other] = await ethers.getSigners();
      await expect(
        stakeManager.connect(other).forceMigrateMultipleDelegations(
          VAL_CLOSE, VAL_TARGET, ADDRESSES.DelegatorsOfVal7
        )
      ).to.be.reverted;
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Final State Verification
  // ══════════════════════════════════════════════════════════════════════════

  describe("Final state", function () {
    it("active validator count should be 3", async function () {
      expect(await stakeManager.currentValidatorSetSize()).to.equal(3n);
    });

    it("validators 2, 3, 5 should be active; validator 7 inactive", async function () {
      expect(await stakeManager.isValidator(2)).to.be.true;
      expect(await stakeManager.isValidator(3)).to.be.true;
      expect(await stakeManager.isValidator(VAL_TARGET)).to.be.true;
      expect(await stakeManager.isValidator(VAL_CLOSE)).to.be.false;
    });

    it("validator 7 activeAmount should be ~0", async function () {
      expect(await validatorShare7.activeAmount()).to.be.lte(DUST_WEI * BigInt(ADDRESSES.DelegatorsOfVal7.length));
    });
  });
});
