import { StakeManagerTest } from '../../../helpers/artifacts.js'
import { checkPoint, assertInTransaction } from '../../../helpers/utils.js'

import { wallets, freshDeploy, walletAmounts } from '../deployment.js'
import chaiAsPromised from 'chai-as-promised'
import * as chai from 'chai'
import testHelpers from '@openzeppelin/test-helpers'
const expectRevert = testHelpers.expectRevert

chai.use(chaiAsPromised).should()
const assert = chai.assert

const { toWei } = web3.utils

function prepareForTest(dynasties = 4, validatorCount = 8, totalStaked = 0) {
  return async function () {
    await freshDeploy.call(this)
    this.dynasties = dynasties

    // Fresh deploy sets up initial validators
    for (let i = 0; i < validatorCount; i++) {
      const user = wallets[i].getAddressString()
      const amount = walletAmounts[i]
      await approveAndStake.call(this, { wallet: wallets[i], stakeAmount: amount, acceptDelegation: true })
      totalStaked += amount
    }
    this.totalStaked = totalStaked
  }
}

describe('StakeManager Blacklist Functionality', function () {
  let owner, governance, alice, bob, blacklistedUser

  before(async () => {
    const accounts = await ethers.getSigners()
    owner = accounts[0]
    governance = accounts[1]
    alice = accounts[2]
    bob = accounts[3]
    blacklistedUser = accounts[4]
  })

  describe('Blacklist Management', function () {
    before(prepareForTest(1, 4))

    it('should allow governance to blacklist user for deposits', async function () {
      const user = blacklistedUser.address

      // Set blacklist config - block deposits
      await this.stakeManager.updateBlacklist(user, true, false)

      // Check blacklist status
      const blacklistConfig = await this.stakeManager.blacklist(user)
      assert.equal(blacklistConfig.depositBlocked, true)
      assert.equal(blacklistConfig.withdrawBlocked, false)
    })

    it('should allow governance to blacklist user for withdrawals', async function () {
      const user = blacklistedUser.address

      // Set blacklist config - block withdrawals
      await this.stakeManager.updateBlacklist(user, false, true)

      // Check blacklist status
      const blacklistConfig = await this.stakeManager.blacklist(user)
      assert.equal(blacklistConfig.depositBlocked, false)
      assert.equal(blacklistConfig.withdrawBlocked, true)
    })

    it('should allow governance to blacklist user for both deposits and withdrawals', async function () {
      const user = blacklistedUser.address

      // Set blacklist config - block both
      await this.stakeManager.updateBlacklist(user, true, true)

      // Check blacklist status
      const blacklistConfig = await this.stakeManager.blacklist(user)
      assert.equal(blacklistConfig.depositBlocked, true)
      assert.equal(blacklistConfig.withdrawBlocked, true)
    })

    it('should emit BlacklistUpdated event', async function () {
      const user = blacklistedUser.address

      const tx = await this.stakeManager.updateBlacklist(user, true, false)
      this.receipt = await tx.wait()

      assertInTransaction(this.receipt, StakeManagerTest, 'BlacklistUpdated', {
        user: user,
        depositBlocked: true,
        withdrawBlocked: false,
        operator: this.rootChainOwner.address
      })
    })

    it('should only allow governance to update blacklist', async function () {
      const user = blacklistedUser.address

      await expectRevert(
        this.stakeManager.connect(wallets[2].signer).updateBlacklist(user, true, false),
        'Only governance'
      )
    })
  })

  describe('StakeFor Function Blacklist Enforcement', function () {
    before(prepareForTest(1, 4))

    it('should prevent blacklisted user from staking', async function () {
      const user = blacklistedUser.address

      // Blacklist user for deposits
      await this.stakeManager.updateBlacklist(user, true, false)

      // Try to stake as blacklisted user
      const amount = toWei('100')
      const heimdallFee = toWei('1')
      await this.stakeToken.transfer(user, amount.add(heimdallFee))
      await this.stakeToken.connect(blacklistedUser).approve(this.stakeManager.address, amount.add(heimdallFee))

      await expectRevert(
        this.stakeManager
          .connect(blacklistedUser)
          .stakeFor(user, amount, heimdallFee, true, wallets[0].getPublicKeyString()),
        'deposit blocked'
      )
    })

    it('should allow non-blacklisted user to stake normally', async function () {
      const user = alice.address
      const amount = toWei('100')
      const heimdallFee = toWei('1')

      await this.stakeToken.transfer(user, amount.add(heimdallFee))
      await this.stakeToken.connect(alice).approve(this.stakeManager.address, amount.add(heimdallFee))

      // Should succeed
      await this.stakeManager.connect(alice).stakeFor(user, amount, heimdallFee, true, wallets[0].getPublicKeyString())
    })
  })

  describe('UnstakeClaim Function Blacklist Enforcement', function () {
    before(prepareForTest(1, 4))

    it('should prevent blacklisted validator from claiming unstake', async function () {
      // First, have blacklisted user stake
      const user = blacklistedUser.address
      const amount = toWei('100')
      const heimdallFee = toWei('1')
      const totalAmount = amount.add(heimdallFee)

      await this.stakeToken.transfer(user, totalAmount)
      await this.stakeToken.connect(blacklistedUser).approve(this.stakeManager.address, totalAmount)

      await this.stakeManager
        .connect(blacklistedUser)
        .stakeFor(user, amount, heimdallFee, true, wallets[0].getPublicKeyString())

      const validatorId = await this.stakeManager.getValidatorId(user)

      // Unstake
      await this.stakeManager.connect(blacklistedUser).unstake(validatorId)

      // Wait for withdrawal delay
      await checkPoint([wallets[0]], this.rootChainOwner, this.stakeManager)

      // Blacklist for withdrawals
      await this.stakeManager.updateBlacklist(user, false, true)

      // Try to claim unstake - should fail
      await expectRevert(this.stakeManager.connect(blacklistedUser).unstakeClaim(validatorId), 'withdraw blocked')
    })
  })

  describe('WithdrawRewards Function Blacklist Enforcement', function () {
    before(prepareForTest(1, 4))

    it('should prevent blacklisted validator from withdrawing rewards', async function () {
      // First stake as user then blacklist
      const user = alice.address
      const amount = toWei('100')
      const heimdallFee = toWei('1')
      const totalAmount = amount.add(heimdallFee)

      await this.stakeToken.transfer(user, totalAmount)
      await this.stakeToken.connect(alice).approve(this.stakeManager.address, totalAmount)

      await this.stakeManager.connect(alice).stakeFor(user, amount, heimdallFee, true, wallets[0].getPublicKeyString())

      const validatorId = await this.stakeManager.getValidatorId(user)

      // Generate some rewards through checkpointing
      await checkPoint([wallets[0], alice], this.rootChainOwner, this.stakeManager)

      // Blacklist for withdrawals
      await this.stakeManager.updateBlacklist(user, false, true)

      // Try to withdraw rewards - should fail
      await expectRevert(this.stakeManager.connect(alice).withdrawRewards(validatorId), 'withdraw blocked')
    })
  })
})

describe('StakeManager New Governance Functions', function () {
  let alice, bob

  before(async () => {
    const accounts = await ethers.getSigners()
    alice = accounts[2]
    bob = accounts[3]
  })

  describe('adminConsumeValidatorLegacyUnbond', function () {
    before(prepareForTest(1, 4))

    it('should allow governance to consume legacy unbond', async function () {
      const validatorId = 1
      const user = alice.address

      // First ensure there's a validator share
      const validator = await this.stakeManager.validators(validatorId)
      assert.notEqual(validator.contractAddress, ethers.ZeroAddress)

      const tx = await this.stakeManager.adminConsumeValidatorLegacyUnbond(validatorId, user)
      this.receipt = await tx.wait()

      // Check for ForceConsumeLegacyUnbond event
      assertInTransaction(this.receipt, StakeManagerTest, 'ForceConsumeLegacyUnbond', {
        validatorId: validatorId.toString(),
        user: user,
        validatorShare: validator.contractAddress,
        operator: this.rootChainOwner.address
      })
    })

    it('should revert if validator share does not exist', async function () {
      const invalidValidatorId = 999
      const user = alice.address

      await expectRevert(
        this.stakeManager.adminConsumeValidatorLegacyUnbond(invalidValidatorId, user),
        'no validator share'
      )
    })

    it('should only allow governance to call', async function () {
      const validatorId = 1
      const user = alice.address

      await expectRevert(
        this.stakeManager.connect(alice).adminConsumeValidatorLegacyUnbond(validatorId, user),
        'Only governance'
      )
    })
  })

  describe('updateValidatorShareImplementation', function () {
    before(prepareForTest(1, 4))

    it('should allow governance to update validator share implementation', async function () {
      const validatorId = 1
      const newImplementation = bob.address // Using bob's address as mock implementation

      // First ensure there's a validator share
      const validator = await this.stakeManager.validators(validatorId)
      assert.notEqual(validator.contractAddress, ethers.ZeroAddress)

      const tx = await this.stakeManager.updateValidatorShareImplementation(validatorId, newImplementation)
      this.receipt = await tx.wait()

      // Check for ValidatorShareImplementationUpdated event
      assertInTransaction(this.receipt, StakeManagerTest, 'ValidatorShareImplementationUpdated', {
        validatorId: validatorId.toString(),
        validatorShare: validator.contractAddress,
        newImplementation: newImplementation,
        operator: this.rootChainOwner.address
      })
    })

    it('should revert with invalid implementation address', async function () {
      const validatorId = 1
      const invalidImplementation = ethers.ZeroAddress

      await expectRevert(
        this.stakeManager.updateValidatorShareImplementation(validatorId, invalidImplementation),
        'invalid implementation'
      )
    })

    it('should revert if validator share does not exist', async function () {
      const invalidValidatorId = 999
      const newImplementation = bob.address

      await expectRevert(
        this.stakeManager.updateValidatorShareImplementation(invalidValidatorId, newImplementation),
        'no validator share'
      )
    })

    it('should only allow governance to call', async function () {
      const validatorId = 1
      const newImplementation = bob.address

      await expectRevert(
        this.stakeManager.connect(alice).updateValidatorShareImplementation(validatorId, newImplementation),
        'Only governance'
      )
    })
  })
})
