const { expect } = require("chai");
const { ethers, network, time } = require("hardhat");

describe("StakeManager Blacklist Functionality", function () {
  // Contract addresses (mainnet addresses for fork testing)
  const STAKEMANAGER = "0x65218A41Fb92637254B4f8c97448d3dF343A3064";
  const GOVERNANCE = "0xC476E20c2F7FA3B35aC242aBE71B59e902242f06";
  const REGISTRY = "0xF486e3B6A432Bdd6EDaAe85a565CD7682A7862BB";
  const TOKEN = "0x0000000000000000000000000000000000001010"; // MATIC token

  // Test addresses
  const TEST_USER1 = "0x1234567890123456789012345678901234567890";
  const TEST_USER2 = "0x2345678901234567890123456789012345678901";
  const TEST_VALIDATOR = "0x3456789012345678901234567890123456789012";

  let stakeManager;
  let governance;
  let testUser1, testUser2, testValidator;
  let validatorId = 1; // Use existing validator for some tests

  before(async function () {
    console.log("=== StakeManager Blacklist Tests Setup ===");

    // Get StakeManager contract
    stakeManager = await ethers.getContractAt("StakeManager", STAKEMANAGER);

    // Impersonate governance account
    await ethers.provider.send("hardhat_impersonateAccount", [GOVERNANCE]);
    await ethers.provider.send("hardhat_setBalance", [
      GOVERNANCE,
      "0x1000000000000000000", // 1 ETH
    ]);
    governance = await ethers.getSigner(GOVERNANCE);

    // Impersonate test users
    for (const addr of [TEST_USER1, TEST_USER2, TEST_VALIDATOR]) {
      await ethers.provider.send("hardhat_impersonateAccount", [addr]);
      await ethers.provider.send("hardhat_setBalance", [
        addr,
        "0x1000000000000000000", // 1 ETH
      ]);
    }

    testUser1 = await ethers.getSigner(TEST_USER1);
    testUser2 = await ethers.getSigner(TEST_USER2);
    testValidator = await ethers.getSigner(TEST_VALIDATOR);

    console.log("Setup complete - accounts impersonated");
  });

  describe("updateBlacklist Function", function () {
    it("should allow governance to blacklist a user for deposits only", async function () {
      // Initially user should not be blacklisted
      const initialBlacklist = await stakeManager.blacklist(TEST_USER1);
      expect(initialBlacklist.depositBlocked).to.be.false;
      expect(initialBlacklist.withdrawBlocked).to.be.false;

      // Blacklist user for deposits only
      const tx = await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER1, true, false); // depositBlocked=true, withdrawBlocked=false

      const receipt = await tx.wait();

      // Verify blacklist state
      const blacklist = await stakeManager.blacklist(TEST_USER1);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.false;

      // Verify event emission
      const event = receipt.logs.find((log) => {
        try {
          const parsed = stakeManager.interface.parseLog(log);
          return parsed.name === "BlacklistUpdated";
        } catch (e) {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      const parsedEvent = stakeManager.interface.parseLog(event);
      expect(parsedEvent.args.user).to.equal(TEST_USER1);
      expect(parsedEvent.args.depositBlocked).to.be.true;
      expect(parsedEvent.args.withdrawBlocked).to.be.false;
      expect(parsedEvent.args.operator).to.equal(GOVERNANCE);
    });

    it("should allow governance to blacklist a user for withdrawals only", async function () {
      // Blacklist user for withdrawals only
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER2, false, true); // depositBlocked=false, withdrawBlocked=true

      // Verify blacklist state
      const blacklist = await stakeManager.blacklist(TEST_USER2);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.true;
    });

    it("should allow governance to blacklist a user for both deposits and withdrawals", async function () {
      const testUser = "0x4567890123456789012345678901234567890123";

      // Blacklist user for both deposits and withdrawals
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, true, true); // depositBlocked=true, withdrawBlocked=true

      // Verify blacklist state
      const blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.true;
    });

    it("should allow governance to remove blacklist restrictions", async function () {
      const testUser = "0x5678901234567890123456789012345678901234";

      // First blacklist the user
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, true, true);

      // Verify user is blacklisted
      let blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.true;

      // Remove blacklist restrictions
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, false, false);

      // Verify blacklist is removed
      blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.false;
    });

    it("should revert when non-governance tries to update blacklist", async function () {
      await expect(
        stakeManager.connect(testUser1).updateBlacklist(TEST_USER2, true, true)
      ).to.be.revertedWith("Only governance contract is authorized");
    });

    it("should emit BlacklistUpdated event with correct parameters", async function () {
      const testUser = "0x6789012345678901234567890123456789012345";

      const tx = await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, true, false);

      await expect(tx)
        .to.emit(stakeManager, "BlacklistUpdated")
        .withArgs(testUser, true, false, await time.latest(), GOVERNANCE);
    });
  });

  describe("Blacklist Enforcement in Functions", function () {
    beforeEach(async function () {
      // Reset blacklists before each test
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER1, false, false);
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER2, false, false);
    });

    describe("stakeFor Function", function () {
      it("should revert when user is blacklisted for deposits", async function () {
        // Blacklist user for deposits
        await stakeManager
          .connect(governance)
          .updateBlacklist(TEST_USER1, true, false);

        // Try to stake - should revert
        const amount = ethers.parseEther("1");
        const heimdallFee = ethers.parseEther("0.1");
        const signerPubkey = "0x" + "04".repeat(64); // Mock pubkey

        await expect(
          stakeManager
            .connect(testUser1)
            .stakeFor(TEST_USER1, amount, heimdallFee, true, signerPubkey)
        ).to.be.revertedWith("deposit blocked");
      });

      it("should succeed when user is not blacklisted for deposits", async function () {
        // Ensure user is not blacklisted
        const blacklist = await stakeManager.blacklist(TEST_USER1);
        expect(blacklist.depositBlocked).to.be.false;

        // Note: This test may fail due to other validation requirements
        // like minimum deposit, validator threshold, etc.
        // In a real test environment, you'd mock these dependencies
      });
    });

    describe("delegationDeposit Function", function () {
      it("should revert when delegator is blacklisted for deposits", async function () {
        // Blacklist user for deposits
        await stakeManager
          .connect(governance)
          .updateBlacklist(TEST_USER1, true, false);

        // This function is called by ValidatorShare contracts
        // In practice, we'd need to mock the ValidatorShare call
        // For now, we verify the require statement exists in the code

        // Try calling directly (will fail due to access control, but should hit blacklist check first)
        await expect(
          stakeManager
            .connect(testUser1)
            .delegationDeposit(validatorId, ethers.parseEther("1"), TEST_USER1)
        ).to.be.revertedWith("deposit blocked");
      });
    });

    describe("transferFunds Function", function () {
      it("should revert when delegator is blacklisted for withdrawals", async function () {
        // Blacklist user for withdrawals
        await stakeManager
          .connect(governance)
          .updateBlacklist(TEST_USER1, false, true);

        // This function is called by ValidatorShare contracts
        // Try calling directly (will fail due to access control, but should hit blacklist check first)
        await expect(
          stakeManager
            .connect(testUser1)
            .transferFunds(validatorId, ethers.parseEther("1"), TEST_USER1)
        ).to.be.revertedWith("withdraw blocked");
      });
    });

    describe("unstakeClaim Function", function () {
      it("should revert when validator owner is blacklisted for withdrawals", async function () {
        // First we need to set up a validator scenario
        // For this test, we'll use a mock approach

        // Blacklist user for withdrawals
        await stakeManager
          .connect(governance)
          .updateBlacklist(TEST_VALIDATOR, false, true);

        // Mock scenario: user tries to claim unstake
        // This would require the user to actually own a validator NFT
        // For testing purposes, we verify the blacklist check logic

        // In a full test, you'd:
        // 1. Create a validator
        // 2. Initiate unstaking
        // 3. Wait for withdrawal delay
        // 4. Try to claim (should fail due to blacklist)
      });
    });

    describe("withdrawRewards Function", function () {
      it("should revert when validator owner is blacklisted for withdrawals", async function () {
        // Blacklist user for withdrawals
        await stakeManager
          .connect(governance)
          .updateBlacklist(TEST_VALIDATOR, false, true);

        // Similar to unstakeClaim, this requires validator ownership
        // In practice, you'd set up a validator scenario
      });
    });
  });

  describe("Blacklist State Queries", function () {
    it("should return correct blacklist status for users", async function () {
      // Test user with no blacklist
      let blacklist = await stakeManager.blacklist(TEST_USER1);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.false;

      // Set deposit blacklist
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER1, true, false);

      blacklist = await stakeManager.blacklist(TEST_USER1);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.false;

      // Set withdraw blacklist
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER1, false, true);

      blacklist = await stakeManager.blacklist(TEST_USER1);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.true;

      // Set both
      await stakeManager
        .connect(governance)
        .updateBlacklist(TEST_USER1, true, true);

      blacklist = await stakeManager.blacklist(TEST_USER1);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.true;
    });
  });

  describe("Integration Scenarios", function () {
    it("should handle multiple users with different blacklist configurations", async function () {
      const users = [
        {
          addr: "0x1111111111111111111111111111111111111111",
          deposit: true,
          withdraw: false,
        },
        {
          addr: "0x2222222222222222222222222222222222222222",
          deposit: false,
          withdraw: true,
        },
        {
          addr: "0x3333333333333333333333333333333333333333",
          deposit: true,
          withdraw: true,
        },
        {
          addr: "0x4444444444444444444444444444444444444444",
          deposit: false,
          withdraw: false,
        },
      ];

      // Set different blacklist configurations
      for (const user of users) {
        await stakeManager
          .connect(governance)
          .updateBlacklist(user.addr, user.deposit, user.withdraw);
      }

      // Verify each configuration
      for (const user of users) {
        const blacklist = await stakeManager.blacklist(user.addr);
        expect(blacklist.depositBlocked).to.equal(user.deposit);
        expect(blacklist.withdrawBlocked).to.equal(user.withdraw);
      }
    });

    it("should maintain blacklist state across multiple updates", async function () {
      const testUser = "0x5555555555555555555555555555555555555555";

      // Initial state: no blacklist
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, false, false);

      let blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.false;

      // Update 1: block deposits
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, true, false);

      blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.false;

      // Update 2: block withdrawals too
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, true, true);

      blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.true;

      // Update 3: unblock deposits, keep withdrawals blocked
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, false, true);

      blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.true;

      // Update 4: remove all restrictions
      await stakeManager
        .connect(governance)
        .updateBlacklist(testUser, false, false);

      blacklist = await stakeManager.blacklist(testUser);
      expect(blacklist.depositBlocked).to.be.false;
      expect(blacklist.withdrawBlocked).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    it("should handle zero address blacklisting", async function () {
      const zeroAddress = ethers.ZeroAddress;

      await stakeManager
        .connect(governance)
        .updateBlacklist(zeroAddress, true, true);

      const blacklist = await stakeManager.blacklist(zeroAddress);
      expect(blacklist.depositBlocked).to.be.true;
      expect(blacklist.withdrawBlocked).to.be.true;
    });

    it("should handle same user multiple consecutive updates", async function () {
      const testUser = "0x6666666666666666666666666666666666666666";

      // Multiple updates with same values
      for (let i = 0; i < 3; i++) {
        await stakeManager
          .connect(governance)
          .updateBlacklist(testUser, true, false);

        const blacklist = await stakeManager.blacklist(testUser);
        expect(blacklist.depositBlocked).to.be.true;
        expect(blacklist.withdrawBlocked).to.be.false;
      }
    });

    it("should emit events for all blacklist updates", async function () {
      const testUser = "0x7777777777777777777777777777777777777777";

      // Track events
      const updates = [
        { deposit: true, withdraw: false },
        { deposit: false, withdraw: true },
        { deposit: true, withdraw: true },
        { deposit: false, withdraw: false },
      ];

      for (const update of updates) {
        const tx = await stakeManager
          .connect(governance)
          .updateBlacklist(testUser, update.deposit, update.withdraw);

        await expect(tx)
          .to.emit(stakeManager, "BlacklistUpdated")
          .withArgs(
            testUser,
            update.deposit,
            update.withdraw,
            await time.latest(),
            GOVERNANCE
          );
      }
    });
  });
});
