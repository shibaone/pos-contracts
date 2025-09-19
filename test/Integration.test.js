const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Bridge Hack State Correction Integration", function () {
  // Mainnet addresses
  const STAKEMANAGER = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";
  const OWNER = "0xBab4F3e701F6d2e009Af3C7f1eF2e7dD68225E96";
  const GOVERNANCE = "0xC476E20c2F7FA3B35aC242aBE71B59e902242f06";

  // Validator details
  const VALIDATOR_ID = 1;
  const VALIDATOR_SHARE = "0xB817B7C987bE0a0Bc85c807Eb8Dc7848270Cc523";
  const TARGET_USER = "0xe9B854365FF0F4Ce7a155f177f528cb37A737Ab7";
  const STAKING_LOGGER = "0x539964b3d225194717fb896D26c8b3E635b8A1aE";
  const REGISTRY = "0xF486e3B6A432Bdd6EDaAe85a565CD7682A7862BB";

  let stakeManager, validatorShareProxy;
  let owner;

  const iface = new ethers.Interface([
    "function updateContractMap(bytes32,address)",
  ]);

  function encodeUpdateContractMapData(validatorShareAddress) {
    return iface.encodeFunctionData("updateContractMap", [
      ethers.keccak256(ethers.toUtf8Bytes("validatorShare")),
      validatorShareAddress,
    ]);
  }

  before(async function () {
    console.log("\t=== Bridge Hack State Correction Integration Test ===");

    // Impersonate required accounts
    await ethers.provider.send("hardhat_impersonateAccount", [OWNER]);
    await ethers.provider.send("hardhat_setBalance", [
      OWNER,
      "0x1000000000000000000",
    ]);

    owner = await ethers.getSigner(OWNER);

    // Get StakeManager contract
    stakeManager = await ethers.getContractAt("StakeManager", STAKEMANAGER);

    console.log("\t\tSetup complete - accounts impersonated");
  });

  it("should deploy new ValidatorShare implementation and update via Registry", async function () {
    console.log("\t\t=== Step 1: Deploy new ValidatorShare implementation ===");

    // Deploy new ValidatorShare implementation
    const ValidatorShare = await ethers.getContractFactory(
      "ValidatorShare",
      owner
    );
    const newValidatorShareImpl = await ValidatorShare.deploy();
    await newValidatorShareImpl.waitForDeployment();

    const newImplAddress = await newValidatorShareImpl.getAddress();
    console.log(
      "\t\tNew ValidatorShare implementation deployed at:",
      newImplAddress
    );

    expect(newImplAddress).to.not.equal(ethers.ZeroAddress);

    console.log(
      "\t\t=== Step 2: Get current ValidatorShare implementation ==="
    );

    // Get the ValidatorShareProxy contract
    validatorShareProxy = await ethers.getContractAt(
      "ValidatorShareProxy",
      VALIDATOR_SHARE
    );

    // Get current implementation before upgrade
    const currentImpl = await validatorShareProxy.implementation();
    console.log("\t\tCurrent ValidatorShare implementation:", currentImpl);

    console.log(
      "\t\t=== Step 3: Update ValidatorShare implementation via Registry ==="
    );

    // Get the Registry address
    const registryAddress = REGISTRY;

    // Get the Registry contract
    const registry = await ethers.getContractAt("Registry", registryAddress);

    // Check current ValidatorShare implementation in Registry
    const currentRegistryImpl = await registry.getValidatorShareAddress();
    console.log(
      "\t\tCurrent ValidatorShare implementation in Registry:",
      currentRegistryImpl
    );

    // Update ValidatorShare implementation via Governance.update() method
    const governance = await ethers.getContractAt("Governance", GOVERNANCE);

    // Use the proper governance.update() method to update the registry
    const updateData = encodeUpdateContractMapData(newImplAddress);
    const updateTx = await governance
      .connect(owner)
      .update(REGISTRY, updateData);
    await updateTx.wait();

    console.log(
      "\t\tValidatorShare implementation updated via Governance.update()"
    );

    // Verify the Registry was updated
    const updatedRegistryImpl = await registry.getValidatorShareAddress();
    console.log(
      "\t\tUpdated ValidatorShare implementation in Registry:",
      updatedRegistryImpl
    );

    expect(updatedRegistryImpl).to.equal(newImplAddress);
    expect(updatedRegistryImpl).to.not.equal(currentRegistryImpl);

    // Now verify that the ValidatorShareProxy is using the new implementation
    const proxyImpl = await validatorShareProxy.implementation();

    expect(proxyImpl).to.equal(newImplAddress);

    // Store the new implementation for use in the next test
    // (newValidatorShareImpl is already available in the global scope)

    // Verify the validator info is correct
    const validator = await stakeManager.validators(VALIDATOR_ID);
    expect(validator.contractAddress).to.equal(VALIDATOR_SHARE);
  });

  it("should reset unbonds state for target user via adminConsumeValidatorLegacyUnbond", async function () {
    console.log("\t\t=== Step 1: Check initial unbonds state ===");

    // Get ValidatorShare contract (should now be using the new implementation from the previous test)
    const validatorShare = await ethers.getContractAt(
      "ValidatorShare",
      VALIDATOR_SHARE
    );

    // Check original unbonds state for the target user
    const unbondsBefore = await validatorShare.unbonds(TARGET_USER);
    const unbondNoncesBefore = await validatorShare.unbondNonces(TARGET_USER);

    console.log("\t\tInitial unbonds state for user", TARGET_USER + ":");
    console.log("\t\tLegacy unbonds:");
    console.log("\t\t\t- Shares:", unbondsBefore.shares.toString());
    console.log(
      "\t\t\t- Withdraw Epoch:",
      unbondsBefore.withdrawEpoch.toString()
    );
    console.log("\t\tNew-style unbonds:");
    console.log("\t\t\t- Unbond nonces:", unbondNoncesBefore.toString());

    // Verify that the user has some unbonds (evidence of the hack)
    const hasLegacyUnbonds = unbondsBefore.shares.toString() !== "0";
    const hasNewUnbonds = unbondNoncesBefore.toString() !== "0";

    expect(hasLegacyUnbonds || hasNewUnbonds).to.be.true;
    console.log("\t\t✅ User has unbonds that need to be processed");

    if (hasLegacyUnbonds) {
      console.log("\t\t\t- Has legacy unbonds");
    }
    if (hasNewUnbonds) {
      console.log("\t\t\t- Has new-style unbonds");
    }

    console.log("\t\t=== Step 2: Check Withdrawal Timing Requirements ===");

    // Check current epoch and withdrawal requirements
    const currentEpoch = await stakeManager.epoch();
    const withdrawalDelay = await stakeManager.withdrawalDelay();
    const userUnbonds = await validatorShare.unbonds(TARGET_USER);

    console.log("\t\t\tCurrent epoch:", currentEpoch.toString());
    console.log("\t\t\tWithdrawal delay:", withdrawalDelay.toString());
    console.log(
      "\t\t\tUser withdraw epoch:",
      userUnbonds.withdrawEpoch.toString()
    );
    console.log(
      "\t\t\tRequired epoch:",
      (userUnbonds.withdrawEpoch + withdrawalDelay).toString()
    );

    const canWithdraw =
      currentEpoch >= userUnbonds.withdrawEpoch + withdrawalDelay;
    console.log("\t\t\tCan withdraw now:", canWithdraw);

    // Advance epoch if needed
    if (!canWithdraw) {
      console.log(
        "\t\t=== Advancing Epoch to Meet Withdrawal Requirements ==="
      );

      const governance = await stakeManager.governance();
      await ethers.provider.send("hardhat_impersonateAccount", [governance]);
      await ethers.provider.send("hardhat_setBalance", [
        governance,
        "0x1000000000000000000",
      ]);
      const governanceSigner = await ethers.getSigner(governance);

      const targetEpoch = userUnbonds.withdrawEpoch + withdrawalDelay;
      await stakeManager.connect(governanceSigner).setCurrentEpoch(targetEpoch);

      const newEpoch = await stakeManager.epoch();
      console.log("\t\t✅ Epoch advanced to:", newEpoch.toString());
    }

    console.log(
      "\t\t=== Step 3: Execute adminConsumeLegacyUnbond directly on ValidatorShare ==="
    );

    // Get StakeManager owner and impersonate them (using Ownable interface)
    const stakeManagerOwner = await stakeManager.owner();
    console.log("\t\tStakeManager owner:", stakeManagerOwner);
    console.log(
      "\t\tImpersonating StakeManager owner to call adminConsumeLegacyUnbond..."
    );

    await ethers.provider.send("hardhat_impersonateAccount", [
      stakeManagerOwner,
    ]);
    await ethers.provider.send("hardhat_setBalance", [
      stakeManagerOwner,
      "0x1000000000000000000",
    ]);
    const stakeManagerOwnerSigner = await ethers.getSigner(stakeManagerOwner);

    const correctionTx = await validatorShare
      .connect(stakeManagerOwnerSigner)
      .adminConsumeLegacyUnbond(TARGET_USER);
    const receipt = await correctionTx.wait();

    console.log("\t\t✅ adminConsumeLegacyUnbond executed successfully!");
    console.log("\t\tTransaction hash:", correctionTx.hash);

    // Parse events from the receipt
    const validatorShareInterface = validatorShare.interface;
    const parsedCorrectionEvents = receipt.logs
      .map((log) => {
        try {
          return validatorShareInterface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter((event) => event !== null);

    console.log(
      "\t\tEvents emitted:",
      parsedCorrectionEvents.map((e) => e.name)
    );

    // Look for AdminConsumedUnbond event
    const adminConsumedEvent = parsedCorrectionEvents.find(
      (e) => e.name === "AdminConsumedUnbond"
    );
    if (adminConsumedEvent) {
      console.log("\t\t✅ AdminConsumedUnbond event emitted:");
      console.log(
        "\t\t\t- Validator ID:",
        adminConsumedEvent.args.validatorId.toString()
      );
      console.log("\t\t\t- User:", adminConsumedEvent.args.user);
      console.log("\t\t\t- Amount:", adminConsumedEvent.args.amount.toString());
      console.log("\t\t\t- Shares:", adminConsumedEvent.args.shares.toString());
    } else {
      console.log(
        "\t\t\t⚠️ No AdminConsumedUnbond event found (but function may have succeeded)"
      );
    }

    console.log("\t\t=== Step 4: Verify unbonds state has been reset ===");

    // Check legacy unbonds state after correction
    const unbondsAfter = await validatorShare.unbonds(TARGET_USER);
    console.log(
      "\t\t\tLegacy unbonds state after correction for user",
      TARGET_USER + ":"
    );
    console.log("\t\t\t- Shares:", unbondsAfter.shares.toString());
    console.log(
      "\t\t\t- Withdraw Epoch:",
      unbondsAfter.withdrawEpoch.toString()
    );

    // Check new-style unbonds state after correction
    const unbondNoncesAfter = await validatorShare.unbondNonces(TARGET_USER);
    console.log("\t\tNew-style unbonds after correction:");
    console.log("\t\t\t- Unbond nonces:", unbondNoncesAfter.toString());

    // Verify that all unbonds have been cleared (this is the success criteria)
    expect(unbondsAfter.shares.toString()).to.equal(
      "0",
      "Legacy unbond shares should be cleared"
    );
    expect(unbondsAfter.withdrawEpoch.toString()).to.equal(
      "0",
      "Legacy unbond withdrawEpoch should be cleared"
    );
    expect(unbondNoncesAfter.toString()).to.equal(
      "0",
      "New-style unbond nonces should be reset to 0"
    );

    console.log(
      "\t\t\t✅ Success criteria met: all unbonds cleared (legacy + new-style)"
    );

    console.log("\t\t=== Step 5: Final Summary ===");
    console.log("\t\tBefore correction:");
    console.log("\t\t\t- Legacy shares:", unbondsBefore.shares.toString());
    console.log(
      "\t\t\t- Legacy withdraw epoch:",
      unbondsBefore.withdrawEpoch.toString()
    );
    console.log("\t\t- New-style nonces:", unbondNoncesBefore.toString());
    console.log("\t\tAfter correction:");
    console.log("\t\t\t- Legacy shares:", unbondsAfter.shares.toString());
    console.log(
      "\t\t\t- Legacy withdraw epoch:",
      unbondsAfter.withdrawEpoch.toString()
    );
    console.log("\t\t\t- New-style nonces:", unbondNoncesAfter.toString());
  });
});
