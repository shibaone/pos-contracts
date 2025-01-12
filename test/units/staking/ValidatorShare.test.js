import ethUtils from 'ethereumjs-util'
import { TestToken, ERC20Permit, ValidatorShare, StakingInfo, EventsHub, ethers } from '../../helpers/artifacts.js'
import testHelpers from '@openzeppelin/test-helpers'
import { checkPoint, assertBigNumberEquality, assertInTransaction } from '../../helpers/utils.js'
import { wallets, freshDeploy, approveAndStake } from './deployment.js'
import { buyVoucher, buyVoucherWithPermit, sellVoucher, sellVoucherNew } from './ValidatorShareHelper.js'
const BN = testHelpers.BN
const expectRevert = testHelpers.expectRevert
const toWei = web3.utils.toWei
const ZeroAddr = '0x0000000000000000000000000000000000000000'
const ExchangeRatePrecision = new BN('100000000000000000000000000000')
const Dynasty = 8
const ValidatorDefaultStake = new BN(toWei('100'))

describe('ValidatorShare', async function () {
  const wei100 = toWei('100')

  // async function slash(slashes = [], validators = [], proposer = wallets[1], nonce = 1) {
  //   let slashingInfoList = []
  //   for (const slash of slashes) {
  //     slashingInfoList.push([parseInt(slash.validator), slash.amount, '0x0'])
  //   }

  //   return updateSlashedAmounts(validators, proposer, nonce, slashingInfoList, this.slashingManager)
  // }

  async function doDeploy() {
    await freshDeploy.call(this, true)

    this.validatorId = '8'
    this.validatorUser = wallets[0]
    this.stakeAmount = ValidatorDefaultStake

    await this.governance.update(
      this.stakeManager.address,
      this.stakeManager.interface.encodeFunctionData('updateDynastyValue', [Dynasty])
    )
    await this.governance.update(
      this.stakeManager.address,
      this.stakeManager.interface.encodeFunctionData('updateValidatorThreshold', [8])
    )

    // we need to increase validator id beyond foundation id, repeat 7 times
    for (let i = 0; i < 7; ++i) {
      await approveAndStake.call(this, {
        wallet: this.validatorUser,
        stakeAmount: this.stakeAmount,
        acceptDelegation: true
      })
      await this.governance.update(
        this.stakeManager.address,
        this.stakeManager.interface.encodeFunctionData('forceUnstake', [i + 1])
      )
      await this.stakeManager.forceFinalizeCommit()
      await this.stakeManager.advanceEpoch(Dynasty)
      const stakeManagerValidator = this.stakeManager.connect(
        this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
      )
      await stakeManagerValidator.unstakeClaim(i + 1)
      await this.stakeManager.resetSignerUsed(this.validatorUser.getChecksumAddressString())
    }

    await approveAndStake.call(this, {
      wallet: this.validatorUser,
      stakeAmount: this.stakeAmount,
      acceptDelegation: true
    })
    await this.stakeManager.forceFinalizeCommit()

    let validator = await this.stakeManager.validators(this.validatorId)
    this.validatorContract = ValidatorShare.attach(validator.contractAddress)
  }

  describe('locking', function () {
    before(doDeploy)

    describe('lock', function () {
      describe('when from is not stake manager', function () {
        it('reverts', async function () {
          await expectRevert.unspecified(this.validatorContract.lock())
        })
      })
    })

    describe('unlock', function () {
      describe('when from is not stake manager', function () {
        it('reverts', async function () {
          await expectRevert.unspecified(this.validatorContract.unlock())
        })
      })
    })
  })

  describe('updateDelegation', function () {
    describe('when from is not stake manager', function () {
      before(doDeploy)

      it('reverts', async function () {
        const validatorContract1 = this.validatorContract.connect(
          this.validatorContract.provider.getSigner(wallets[1].getAddressString())
        )

        await expectRevert.unspecified(validatorContract1.updateDelegation(false))
      })
    })

    describe('when from is stake manager', function () {
      before(doDeploy)

      it('updates delegation', async function () {
        this.stakeManager1 = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getAddressString())
        )
        await this.stakeManager.updateValidatorDelegation(false)
      })
    })
  })

  function deployAliceAndBob() {
    before(doDeploy)
    before('Alice & Bob', async function () {
      this.alice = wallets[2].getChecksumAddressString()
      this.bob = wallets[3].getChecksumAddressString()
      this.totalStaked = new BN(0)

      const mintAmount = new BN(toWei('70000')).toString()

      await this.stakeToken.mint(this.alice, mintAmount)
      const stakeTokenAlice = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.alice))
      await stakeTokenAlice.approve(this.stakeManager.address, mintAmount)

      await this.stakeToken.mint(this.bob, mintAmount)
      const stakeTokenBob = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.bob))
      await stakeTokenBob.approve(this.stakeManager.address, mintAmount)
    })
  }

  describe('buyVoucherWithPermit', function () {
    function testBuyVoucherWithPermit({
      voucherValue,
      voucherValueExpected,
      userTotalStaked,
      totalStaked,
      shares,
      reward,
      initialBalance
    }) {
      it('must buy voucher with permit', async function () {
        assertBigNumberEquality(await this.polToken.allowance(this.user, this.stakeManager.address), 0)
        this.receipt = await (
          await buyVoucherWithPermit(
            this.validatorContract,
            voucherValue,
            this.user,
            shares,
            this.stakeManager.address,
            this.polToken
          )
        ).wait()
      })

      shouldBuyShares({
        voucherValueExpected,
        shares,
        totalStaked
      })

      shouldHaveCorrectStakes({
        userTotalStaked,
        totalStaked
      })

      shouldWithdrawReward({
        initialBalance,
        reward,
        validatorId: '8',
        pol: true
      })
    }

    describe('when Alice purchases voucher with permit once', function () {
      deployAliceAndBob()

      before(async function () {
        this.user = this.alice
        await this.polToken
          .connect(this.polToken.provider.getSigner(this.user))
          .approve(this.stakeManager.address, 0)
        })

      testBuyVoucherWithPermit({
        voucherValue: toWei('100'),
        voucherValueExpected: toWei('100'),
        userTotalStaked: toWei('100'),
        totalStaked: toWei('200'),
        shares: toWei('100'),
        reward: '0',
        initialBalance: toWei('705')
      })
    })

    describe('when alice provides invalid permit signature', function () {
      deployAliceAndBob()

      before(async function () {
        this.user = this.alice
        await this.polToken
          .connect(this.polToken.provider.getSigner(this.user))
          .approve(this.stakeManager.address, 0)
      })

      it('reverts with incorrect spender', async function () {
        assertBigNumberEquality(await this.polToken.allowance(this.user, this.stakeManager.address), 0)

        await expectRevert(
          buyVoucherWithPermit(
            this.validatorContract,
            toWei('1000'),
            this.user,
            toWei('1000'),
            this.validatorContract.address /* spender, tokens are pulled from stakeManager */,
            this.polToken
          ),
          'ERC2612InvalidSigner'
        )
      })

      it('reverts with incorrect deadline', async function () {
        assertBigNumberEquality(await this.polToken.allowance(this.user, this.stakeManager.address), 0)

        await expectRevert(
          buyVoucherWithPermit(
            this.validatorContract,
            toWei('1000'),
            this.user,
            toWei('1000'),
            this.stakeManager.address,
            this.polToken,
            (await this.validatorContract.provider.getBlock('latest')).timestamp - 60
          ),
          'ERC2612ExpiredSignature'
        )
      })
    })

    describe('when locked', function () {
      deployAliceAndBob()

      before(async function () {
        await this.stakeManager.testLockShareContract(this.validatorId, true)
      })

      it('reverts', async function () {
        await expectRevert(
          buyVoucherWithPermit(
            this.validatorContract,
            toWei('100'),
            this.alice,
            toWei('100'),
            this.stakeManager.address,
            this.polToken
          ),
          'locked'
        )
      })
    })

    describe('when validator unstaked', function () {
      deployAliceAndBob()
      before(async function () {
        const stakeManagerValidator = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerValidator.unstake(this.validatorId)
        await this.stakeManager.advanceEpoch(Dynasty)
      })

      it('reverts', async function () {
        await expectRevert(
          buyVoucherWithPermit(
            this.validatorContract,
            toWei('100'),
            this.alice,
            toWei('100'),
            this.stakeManager.address,
            this.polToken
          ),
          'locked'
        )
      })
    })
  })

  describe('buyVoucher', function () {
    function testBuyVoucher({
      voucherValue,
      voucherValueExpected,
      userTotalStaked,
      totalStaked,
      shares,
      reward,
      initialBalance
    }) {
      it('must buy voucher', async function () {
        this.receipt = await (await buyVoucher(this.validatorContract, voucherValue, this.user, shares)).wait()
      })

      shouldBuyShares({
        voucherValueExpected,
        shares,
        totalStaked
      })

      shouldHaveCorrectStakes({
        userTotalStaked,
        totalStaked
      })

      shouldWithdrawReward({
        initialBalance,
        reward,
        validatorId: '8'
      })
    }

    describe('when Alice purchases voucher once', function () {
      deployAliceAndBob()

      before(function () {
        this.user = this.alice
      })

      testBuyVoucher({
        voucherValue: toWei('100'),
        voucherValueExpected: toWei('100'),
        userTotalStaked: toWei('100'),
        totalStaked: toWei('200'),
        shares: toWei('100'),
        reward: '0',
        initialBalance: toWei('70705')
      })
    })

    describe('when Alice purchases voucher with exact minSharesToMint', function () {
      deployAliceAndBob()

      before(function () {
        this.user = this.alice
      })

      testBuyVoucher({
        voucherValue: toWei('100'),
        voucherValueExpected: toWei('100'),
        userTotalStaked: toWei('100'),
        totalStaked: toWei('200'),
        shares: toWei('100'),
        reward: '0',
        initialBalance: toWei('70705')
      })
    })

    describe('when validator turns off delegation', function () {
      deployAliceAndBob()

      before('disable delegation', async function () {
        const stakeManagerValidator = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerValidator.updateValidatorDelegation(false)
      })

      it('reverts', async function () {
        await expectRevert(buyVoucher(this.validatorContract, toWei('150'), this.alice), 'Delegation is disabled')
      })
    })

    describe('when staking manager delegation is disabled', function () {
      deployAliceAndBob()

      before('disable delegation', async function () {
        await this.governance.update(
          this.stakeManager.address,
          this.stakeManager.interface.encodeFunctionData('setDelegationEnabled', [false])
        )
      })

      it('reverts', async function () {
        await expectRevert(
          buyVoucher(this.validatorContract, web3.utils.toWei('150'), this.alice),
          'Delegation is disabled'
        )
      })
    })

    describe('when Alice purchases voucher 3 times in a row, no checkpoints inbetween', function () {
      deployAliceAndBob()

      before(function () {
        this.user = this.alice
      })

      describe('1st purchase', async function () {
        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('200'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70705')
        })
      })

      describe('2nd purchase', async function () {
        testBuyVoucher({
          voucherValue: toWei('150'),
          voucherValueExpected: toWei('150'),
          userTotalStaked: toWei('250'),
          totalStaked: toWei('350'),
          shares: toWei('150'),
          reward: '0',
          initialBalance: toWei('70555')
        })
      })

      describe('3rd purchase', async function () {
        testBuyVoucher({
          voucherValue: toWei('250'),
          voucherValueExpected: toWei('250'),
          userTotalStaked: toWei('500'),
          totalStaked: toWei('600'),
          shares: toWei('250'),
          reward: '0',
          initialBalance: toWei('70305')
        })
      })
    })

    describe('when Alice purchases voucher 3 times in a row, 1 checkpoint inbetween', function () {
      function advanceCheckpointAfter() {
        after(async function () {
          await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        })
      }

      deployAliceAndBob()

      before(function () {
        this.user = this.alice
      })

      describe('1st purchase', async function () {
        advanceCheckpointAfter()

        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('200'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70705')
        })
      })

      describe('2nd purchase', async function () {
        advanceCheckpointAfter()

        testBuyVoucher({
          voucherValue: toWei('150'),
          voucherValueExpected: toWei('150'),
          userTotalStaked: toWei('250'),
          totalStaked: toWei('350'),
          shares: toWei('150'),
          reward: toWei('4500'),
          initialBalance: toWei('70555')
        })
      })

      describe('3rd purchase', async function () {
        testBuyVoucher({
          voucherValue: toWei('250'),
          voucherValueExpected: toWei('250'),
          userTotalStaked: toWei('500'),
          totalStaked: toWei('600'),
          shares: toWei('250'),
          reward: '6428571428571428571428',
          initialBalance: toWei('74805')
        })
      })
    })

    describe('when Alice and Bob purchase vouchers, no checkpoints inbetween', function () {
      deployAliceAndBob()

      describe('when Alice stakes 1st time', function () {
        before(function () {
          this.user = this.alice
        })

        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('200'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70705')
        })
      })

      describe('when Bob stakes 1st time', function () {
        before(function () {
          this.user = this.bob
        })

        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('300'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70750')
        })
      })

      describe('when Alice stakes 2nd time', function () {
        before(function () {
          this.user = this.alice
        })

        testBuyVoucher({
          voucherValue: toWei('200'),
          voucherValueExpected: toWei('200'),
          userTotalStaked: toWei('300'),
          totalStaked: toWei('500'),
          shares: toWei('200'),
          reward: '0',
          initialBalance: toWei('70505')
        })
      })

      describe('when Bob stakes 2nd time', function () {
        before(function () {
          this.user = this.bob
        })

        testBuyVoucher({
          voucherValue: toWei('200'),
          voucherValueExpected: toWei('200'),
          userTotalStaked: toWei('300'),
          totalStaked: toWei('700'),
          shares: toWei('200'),
          reward: '0',
          initialBalance: toWei('70550')
        })
      })
    })

    describe('when Alice and Bob purchase vouchers, 1 checkpoint inbetween', function () {
      function advanceCheckpointAfter() {
        after(async function () {
          await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        })
      }

      deployAliceAndBob()

      describe('when Alice stakes 1st time', function () {
        advanceCheckpointAfter()
        before(function () {
          this.user = this.alice
        })

        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('200'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70705')
        })
      })

      describe('when Bob stakes 1st time', function () {
        advanceCheckpointAfter()
        before(function () {
          this.user = this.bob
        })

        testBuyVoucher({
          voucherValue: toWei('100'),
          voucherValueExpected: toWei('100'),
          userTotalStaked: toWei('100'),
          totalStaked: toWei('300'),
          shares: toWei('100'),
          reward: '0',
          initialBalance: toWei('70750')
        })
      })

      describe('when Alice stakes 2nd time', function () {
        advanceCheckpointAfter()
        before(function () {
          this.user = this.alice
        })

        testBuyVoucher({
          voucherValue: toWei('200'),
          voucherValueExpected: toWei('200'),
          userTotalStaked: toWei('300'),
          totalStaked: toWei('500'),
          shares: toWei('200'),
          reward: toWei('7500'),
          initialBalance: toWei('70505')
        })
      })

      describe('when Bob stakes 2nd time', function () {
        before(function () {
          this.user = this.bob
        })

        testBuyVoucher({
          voucherValue: toWei('200'),
          voucherValueExpected: toWei('200'),
          userTotalStaked: toWei('300'),
          totalStaked: toWei('700'),
          shares: toWei('200'),
          reward: toWei('4800'),
          initialBalance: toWei('70550')
        })
      })
    })

    describe('when locked', function () {
      deployAliceAndBob()

      before(async function () {
        await this.stakeManager.testLockShareContract(this.validatorId, true)
      })

      it('reverts', async function () {
        await expectRevert(buyVoucher(this.validatorContract, toWei('100'), this.alice, toWei('100')), 'locked')
      })
    })

    describe('when validator unstaked', function () {
      deployAliceAndBob()
      before(async function () {
        const stakeManagerValidator = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerValidator.unstake(this.validatorId)
        await this.stakeManager.advanceEpoch(Dynasty)
      })

      it('reverts', async function () {
        await expectRevert(buyVoucher(this.validatorContract, new BN(toWei('100')), this.alice), 'locked')
      })
    })
  })

  describe('exchangeRate', function () {
    describe('when Alice purchases voucher 2 times, 1 epoch between', function () {
      before(doDeploy)

      before(async function () {
        this.user = wallets[2].getAddressString()
        this.totalStaked = new BN(0)

        const voucherAmount = new BN(toWei('70000')).toString()
        await this.stakeToken.mint(this.user, voucherAmount)
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
        await stakeTokenUser.approve(this.stakeManager.address, voucherAmount)
      })

      it('must buy voucher', async function () {
        const voucherValue = toWei('100')
        this.totalStaked = this.totalStaked.add(new BN(voucherValue))

        await buyVoucher(this.validatorContract, voucherValue, this.user)
      })

      it('exchange rate must be correct', async function () {
        assertBigNumberEquality(await this.validatorContract.exchangeRate(), ExchangeRatePrecision)
      })

      it('must buy another voucher 1 epoch later', async function () {
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)

        const voucherValue = toWei('5000')
        this.totalStaked = this.totalStaked.add(new BN(voucherValue))
        await buyVoucher(this.validatorContract, voucherValue, this.user)
      })

      it('exchange rate must be correct', async function () {
        assertBigNumberEquality(await this.validatorContract.exchangeRate(), ExchangeRatePrecision)
      })
    })

    describe('when Alice purchases voucher and sells it', function () {
      before(doDeploy)
      before(async function () {
        this.user = wallets[2].getAddressString()
        await this.stakeToken.mint(this.user, toWei('250'))

        this.beforeExchangeRate = await this.validatorContract.exchangeRate()
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
        await stakeTokenUser.approve(this.stakeManager.address, toWei('250'))
      })

      it('must purchase voucher', async function () {
        await buyVoucher(this.validatorContract, toWei('100'), this.user)
      })

      it('must sell voucher', async function () {
        await sellVoucher(this.validatorContract, this.user)
      })

      it('must have initial exchange rate', async function () {
        let afterExchangeRate = await this.validatorContract.exchangeRate()
        assertBigNumberEquality(afterExchangeRate, this.beforeExchangeRate)
      })
    })

    // slashing currently disabled
    describe.skip('when Alice is slashed by 50% and then Bob purchases voucher (both buy 100 eth worth of shares)', function () {
      before(doDeploy)

      describe('when Alice is slashed by 50%', function () {
        before(async function () {
          this.user = wallets[2].getAddressString()
          await this.stakeToken.mint(this.user, this.stakeAmount.toString())
          const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
          await stakeTokenUser.approve(this.stakeManager.address, this.stakeAmount.toString())

          await buyVoucher(this.validatorContract, this.stakeAmount, this.user)
        })
        before('slash', async function () {
          await slash.call(
            this,
            [{ validator: this.validatorId, amount: this.stakeAmount }],
            [this.validatorUser],
            this.validatorUser
          )
        })

        it('exchange rate == 50', async function () {
          let rate = await this.validatorContract.exchangeRate()
          assertBigNumberEquality(ExchangeRatePrecision.div(new BN(2)), rate)
        })

        it('Alice shares == 100 eth', async function () {
          const shares = await this.validatorContract.balanceOf(this.user)
          assertBigNumberEquality(this.stakeAmount, shares)
        })
      })

      describe('when Bob purchases a voucher', function () {
        before(async function () {
          this.user = wallets[1].getAddressString()
          await this.stakeToken.mint(this.user, this.stakeAmount.toString())

          this.beforeExchangeRate = await this.validatorContract.exchangeRate()
          const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
          await stakeTokenUser.approve(this.stakeManager.address, this.stakeAmount.toString())

          await buyVoucher(this.validatorContract, this.stakeAmount, this.user)
        })

        it('exchange rate == 50', async function () {
          let rate = await this.validatorContract.exchangeRate()
          assertBigNumberEquality(ExchangeRatePrecision.div(new BN(2)), rate)
        })

        it('Bob shares == 200 eth', async function () {
          const shares = await this.validatorContract.balanceOf(this.user)
          assertBigNumberEquality(this.stakeAmount.mul(new BN(2)), shares)
        })
      })
    })

    describe.skip('when all tokens are slashed', function () {
      before(doDeploy)
      before(async function () {
        this.user = wallets[2].getAddressString()
        await this.stakeToken.mint(this.user, toWei('250'))
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
        await stakeTokenUser.approve(this.stakeManager.address, toWei('250'))
        await buyVoucher(this.validatorContract, toWei('100'), this.user)
        // slash all tokens
        await slash.call(
          this,
          [
            {
              validator: this.validatorId,
              amount: new BN((await this.stakeManager.currentValidatorSetTotalStake()).toString())
            }
          ],
          [this.validatorUser],
          this.validatorUser,
          1
        )
      })

      it('exchange rate must be == 0', async function () {
        assertBigNumberEquality(await this.validatorContract.exchangeRate(), '0')
      })
    })
  })

  describe('sellVoucher', function () {
    const aliceStake = new BN(toWei('100'))
    const bobStake = new BN(toWei('200'))
    const Alice = wallets[2].getChecksumAddressString()
    const Bob = wallets[1].getChecksumAddressString()

    async function doDeployAndBuyVoucherForAliceAndBob(includeBob = false) {
      await doDeploy.call(this)

      const stake = async ({ user, stake }) => {
        await this.stakeToken.mint(user, stake)
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(user))
        await stakeTokenUser.approve(this.stakeManager.address, stake)
        await buyVoucher(this.validatorContract, stake, user)
      }

      await stake({ user: Alice, stake: aliceStake.toString() })

      if (includeBob) {
        await stake({ user: Bob, stake: bobStake.toString() })
      }

      for (let i = 0; i < 4; i++) {
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
      }
    }

    function testSellVoucherNew({
      returnedStake,
      reward,
      initialBalance,
      validatorId,
      user,
      minClaimAmount,
      userTotalStaked,
      totalStaked,
      shares,
      nonce,
      withdrawalExchangeRate = ExchangeRatePrecision
    }) {
      if (minClaimAmount) {
        it('must sell voucher with slippage', async function () {
          this.receipt = await (await sellVoucherNew(this.validatorContract, user, minClaimAmount)).wait()
        })
      } else {
        it('must sell voucher', async function () {
          this.receipt = await (await sellVoucherNew(this.validatorContract, user)).wait()
        })
      }

      if (nonce) {
        it('must emit ShareBurnedWithId', async function () {
          assertInTransaction(this.receipt, EventsHub, 'ShareBurnedWithId', {
            validatorId: validatorId,
            tokens: shares.toString(),
            amount: returnedStake.toString(),
            user: user,
            nonce
          })
        })
      } else {
        it('must emit ShareBurned', async function () {
          assertInTransaction(this.receipt, StakingInfo, 'ShareBurned', {
            validatorId: validatorId,
            tokens: shares,
            amount: returnedStake,
            user: user
          })
        })
      }

      shouldWithdrawReward({ initialBalance, validatorId, user, reward })

      shouldHaveCorrectStakes({
        userTotalStaked,
        totalStaked,
        user
      })

      it('must have correct withdrawal exchange rate', async function () {
        const rate = await this.validatorContract.withdrawExchangeRate()
        assertBigNumberEquality(rate, withdrawalExchangeRate)
      })
    }

    function testSellVoucher({
      returnedStake,
      reward,
      initialBalance,
      validatorId,
      user,
      minClaimAmount,
      userTotalStaked,
      totalStaked,
      shares,
      withdrawalExchangeRate = ExchangeRatePrecision
    }) {
      if (minClaimAmount) {
        it('must sell voucher with slippage', async function () {
          this.receipt = await (await sellVoucher(this.validatorContract, user, minClaimAmount.toString())).wait()
        })
      } else {
        it('must sell voucher', async function () {
          this.receipt = await (await sellVoucher(this.validatorContract, user)).wait()
        })
      }

      it('must emit ShareBurned', async function () {
        assertInTransaction(this.receipt, StakingInfo, 'ShareBurned', {
          validatorId: validatorId,
          tokens: shares.toString(),
          amount: returnedStake.toString(),
          user: user
        })
      })

      shouldWithdrawReward({ initialBalance, validatorId, user, reward })

      shouldHaveCorrectStakes({
        userTotalStaked,
        totalStaked,
        user
      })

      it('must have correct withdrawal exchange rate', async function () {
        const rate = await this.validatorContract.withdrawExchangeRate()
        assertBigNumberEquality(rate, withdrawalExchangeRate)
      })
    }

    describe('when Alice sells voucher', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)

      testSellVoucher({
        returnedStake: aliceStake,
        reward: toWei('18000'),
        initialBalance: toWei('805'),
        validatorId: '8',
        user: Alice,
        userTotalStaked: toWei('0'),
        totalStaked: ValidatorDefaultStake,
        shares: aliceStake
      })
    })

    // slashing currently disabled
    describe.skip('when Alice sells voucher after 50% slash', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)
      before('slash', async function () {
        await slash.call(
          this,
          [{ validator: this.validatorId, amount: this.stakeAmount }],
          [this.validatorUser],
          this.validatorUser
        )
      })

      const halfStake = aliceStake.div(new BN(2))

      testSellVoucher({
        returnedStake: halfStake,
        reward: toWei('18000'),
        initialBalance: new BN(0),
        validatorId: '8',
        user: Alice,
        userTotalStaked: toWei('0'),
        totalStaked: ValidatorDefaultStake.div(new BN(2)),
        shares: aliceStake
      })
    })

    // slashing currently disabled
    describe.skip('when all tokens are slashed', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)
      before('slash', async function () {
        await slash.call(
          this,
          [
            {
              validator: this.validatorId,
              amount: new BN((await this.stakeManager.currentValidatorSetTotalStake()).toString())
            }
          ],
          [this.validatorUser],
          this.validatorUser
        )
      })

      it('reverts', async function () {
        await expectRevert(sellVoucher(this.validatorContract, Alice, '0'), 'Too much requested')
      })
    })

    describe('when delegation is disabled after voucher was purchased by Alice', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)
      before('disable delegation', async function () {
        await this.governance.update(
          this.stakeManager.address,
          this.stakeManager.interface.encodeFunctionData('setDelegationEnabled', [false])
        )
      })

      testSellVoucher({
        returnedStake: aliceStake,
        reward: toWei('18000'),
        initialBalance: toWei('805'),
        validatorId: '8',
        user: Alice,
        userTotalStaked: toWei('0'),
        totalStaked: ValidatorDefaultStake,
        shares: aliceStake
      })
    })

    describe('when Alice sells with claimAmount greater than expected', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)

      it('reverts', async function () {
        const maxShares = await this.validatorContract.balanceOf(Alice)
        const validatorAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(Alice))
        await expectRevert(validatorAlice.sellVoucher(toWei('100.00001'), maxShares), 'Too much requested')
      })
    })

    describe('when locked', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)

      before(async function () {
        await this.stakeManager.testLockShareContract(this.validatorId, true)
      })

      testSellVoucher({
        returnedStake: aliceStake,
        reward: toWei('18000'),
        initialBalance: toWei('805'),
        validatorId: '8',
        user: Alice,
        userTotalStaked: toWei('0'),
        totalStaked: ValidatorDefaultStake,
        shares: aliceStake
      })
    })

    describe('when validator unstaked', function () {
      before(doDeployAndBuyVoucherForAliceAndBob)
      before(async function () {
        const stakeManagerValidator = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerValidator.unstake(this.validatorId)
        await this.stakeManager.advanceEpoch(Dynasty)
      })

      testSellVoucher({
        returnedStake: aliceStake,
        reward: toWei('18000'),
        initialBalance: toWei('805'),
        validatorId: '8',
        user: Alice,
        userTotalStaked: toWei('0'),
        totalStaked: 0,
        shares: aliceStake
      })
    })

    describe('when Alice and Bob sell within withdrawal delay', function () {
      before(async function () {
        await doDeployAndBuyVoucherForAliceAndBob.call(this, true)
      })

      describe('when Alice sells', function () {
        testSellVoucher({
          returnedStake: aliceStake,
          reward: toWei('9000'),
          initialBalance: toWei('805'),
          validatorId: '8',
          user: Alice,
          userTotalStaked: toWei('0'),
          shares: aliceStake,
          totalStaked: new BN(bobStake).add(ValidatorDefaultStake)
        })
      })

      describe('when Bob sells', function () {
        testSellVoucher({
          returnedStake: bobStake,
          reward: toWei('18000'),
          initialBalance: toWei('1200'),
          validatorId: '8',
          user: Bob,
          userTotalStaked: toWei('0'),
          shares: bobStake,
          totalStaked: ValidatorDefaultStake
        })
      })
    })

    describe('partial sell', function () {
      describe('new API', function () {
        describe('when Alice is not slashed', function () {
          before(doDeployAndBuyVoucherForAliceAndBob)

          const halfStake = aliceStake.div(new BN('2'))

          describe('when Alice sells 50%', function () {
            testSellVoucherNew({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: toWei('18000'),
              initialBalance: toWei('805'),
              validatorId: '8',
              user: Alice,
              userTotalStaked: halfStake,
              nonce: '1',
              totalStaked: halfStake.add(ValidatorDefaultStake)
            })
          })

          describe('when Alice sells 50%, after 1 epoch, within withdrawal delay', function () {
            before(async function () {
              await this.stakeManager.advanceEpoch(1)
            })

            testSellVoucherNew({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: '0',
              initialBalance: new BN(toWei('18805')),
              validatorId: '8',
              user: Alice,
              userTotalStaked: '0',
              nonce: '2',
              totalStaked: ValidatorDefaultStake
            })
          })
        })

        // slashing currently disabled
        describe.skip('when Alice is slashed by 50%', function () {
          before(doDeployAndBuyVoucherForAliceAndBob)
          before(async function () {
            await slash.call(
              this,
              [{ validator: this.validatorId, amount: new BN(toWei('100')) }],
              [this.validatorUser],
              this.validatorUser,
              1
            )
          })

          const halfStake = aliceStake.div(new BN('4')) // slash by 50% occured
          const validatorHalfStake = ValidatorDefaultStake.div(new BN(2))

          describe('when Alice sells 50%', function () {
            testSellVoucherNew({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: toWei('18000'),
              initialBalance: toWei('805'),
              validatorId: '8',
              user: Alice,
              nonce: '1',
              userTotalStaked: halfStake,
              totalStaked: halfStake.add(validatorHalfStake)
            })
          })

          describe('when Alice sells 50%, after 1 epoch, within withdrawal delay', function () {
            before(async function () {
              await this.stakeManager.advanceEpoch(1)
            })

            testSellVoucherNew({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: '0',
              initialBalance: new BN(toWei('18805')),
              validatorId: '8',
              user: Alice,
              userTotalStaked: '0',
              nonce: '2',
              totalStaked: validatorHalfStake
            })
          })
        })
      })

      describe('old API', function () {
        describe('when Alice is not slashed', function () {
          before(doDeployAndBuyVoucherForAliceAndBob)

          const halfStake = aliceStake.div(new BN('2'))

          describe('when Alice sells 50%', function () {
            testSellVoucher({
              shares: new BN(toWei('50')).toString(),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: toWei('18000'),
              initialBalance: toWei('805'),
              validatorId: '8',
              user: Alice,
              userTotalStaked: halfStake,
              totalStaked: halfStake.add(ValidatorDefaultStake)
            })
          })

          describe('when Alice sells 50%, after 1 epoch, within withdrawal delay', function () {
            before(async function () {
              await this.stakeManager.advanceEpoch(1)
            })

            testSellVoucher({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: '0',
              initialBalance: new BN(toWei('18805')),
              validatorId: '8',
              user: Alice,
              userTotalStaked: '0',
              totalStaked: ValidatorDefaultStake
            })

            it('unbond epoch must be set to current epoch', async function () {
              const unbond = await this.validatorContract.unbonds(Alice)
              assertBigNumberEquality(unbond.withdrawEpoch, await this.stakeManager.currentEpoch())
            })
          })
        })

        // slashing currently disabled
        describe.skip('when Alice is slashed by 50%', function () {
          before(doDeployAndBuyVoucherForAliceAndBob)
          before(async function () {
            await slash.call(
              this,
              [{ validator: this.validatorId, amount: new BN(toWei('100')) }],
              [this.validatorUser],
              this.validatorUser,
              1
            )
          })

          const halfStake = aliceStake.div(new BN('4')) // slash by 50% occured
          const validatorHalfStake = ValidatorDefaultStake.div(new BN(2))

          describe('when Alice sells 50%', function () {
            testSellVoucher({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: toWei('18000'),
              initialBalance: new BN(0),
              validatorId: '8',
              user: Alice,
              userTotalStaked: halfStake,
              totalStaked: halfStake.add(validatorHalfStake)
            })
          })

          describe('when Alice sells 50%, after 1 epoch, within withdrawal delay', function () {
            before(async function () {
              await this.stakeManager.advanceEpoch(1)
            })

            testSellVoucher({
              shares: new BN(toWei('50')),
              minClaimAmount: halfStake,
              returnedStake: halfStake,
              reward: '0',
              initialBalance: new BN(toWei('18000')),
              validatorId: '8',
              user: Alice,
              userTotalStaked: '0',
              totalStaked: validatorHalfStake
            })

            it('unbond epoch must be set to current epoch', async function () {
              const unbond = await this.validatorContract.unbonds(Alice)
              assertBigNumberEquality(unbond.withdrawEpoch, await this.stakeManager.currentEpoch())
            })
          })
        })
      })
    })
  })

  describe('withdrawRewards', function () {
    const Alice = wallets[5].getChecksumAddressString()
    const Bob = wallets[6].getChecksumAddressString()
    const Eve = wallets[7].getChecksumAddressString()
    const Carol = wallets[8].getChecksumAddressString()

    let totalDelegatorRewardsReceived
    //let totalSlashed
    let totalStaked
    let totalInitialBalance
    let delegators = []

    function testWithdraw({ label, user, expectedReward, initialBalance }) {
      describe(`when ${label} withdraws`, function () {
        if (expectedReward.toString() === '0') {
          it('reverts', async function () {
            const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(user))
            await expectRevert(validatorUser.withdrawRewards(), 'Too small rewards amount')
          })
        } else {
          it('must withdraw rewards', async function () {
            const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(user))
            this.receipt = await (await validatorUser.withdrawRewards()).wait()
          })

          shouldWithdrawReward({
            reward: expectedReward,
            user: user,
            validatorId: '8',
            initialBalance: initialBalance
          })
        }
      })
    }

    // function testSlash({ amount, nonce }) {
    //   describe('Slash', function () {
    //     it(`${amount.toString()} wei`, async function () {
    //       await slash.call(
    //         this,
    //         [{ validator: this.validatorId, amount: amount }],
    //         [this.validatorUser],
    //         this.validatorUser,
    //         nonce
    //       )
    //       totalSlashed = totalSlashed.add(new BN(amount))
    //     })
    //   })
    // }

    function testStake({ user, amount, label, initialBalance = new BN(0) }) {
      describe(`${label} buyVoucher for ${amount.toString()} wei`, function () {
        it(`must purchase voucher`, async function () {
          totalInitialBalance = totalInitialBalance.add(initialBalance)
          totalStaked = totalStaked.add(new BN(amount))

          await this.stakeToken.mint(user, initialBalance.add(amount).toString())
          const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(user))
          await stakeTokenUser.approve(this.stakeManager.address, amount.toString())
          await buyVoucher(this.validatorContract, amount.toString(), user)
          delegators[user] = delegators[user] || {
            rewards: new BN(0)
          }
        })

        it('must have correct initalRewardPerShare', async function () {
          const currentRewardPerShare = await this.validatorContract.getRewardPerShare()
          const userRewardPerShare = await this.validatorContract.initalRewardPerShare(user)
          assertBigNumberEquality(currentRewardPerShare, userRewardPerShare)
        })
      })
    }

    function testCheckpoint(checkpoints) {
      describe('checkpoints', function () {
        it(`${checkpoints} more checkpoint(s)`, async function () {
          let c = 0
          while (c++ < checkpoints) {
            await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
          }

          totalDelegatorRewardsReceived = new ethers.BigNumber.from(0)
          for (const user in delegators) {
            const rewards = await this.validatorContract.getLiquidRewards(user)
            totalDelegatorRewardsReceived = totalDelegatorRewardsReceived.add(rewards)
          }
        })
      })
    }

    function testLiquidRewards({ user, label, expectedReward }) {
      describe(`${label} liquid rewards`, function () {
        it(`${expectedReward.toString()}`, async function () {
          const rewards = await this.validatorContract.getLiquidRewards(user)
          assertBigNumberEquality(rewards, expectedReward)
        })
      })
    }

    function testAllRewardsReceived({ validatorReward, totalExpectedRewards }) {
      async function getValidatorReward() {
        return this.stakeManager.validatorReward(this.validatorId)
      }

      describe('total rewards', function () {
        it(`validator rewards == ${validatorReward.toString()}`, async function () {
          assertBigNumberEquality(await getValidatorReward.call(this), validatorReward)
        })

        it(`all expected rewards should be ${totalExpectedRewards.toString()}`, async function () {
          const validatorRewards = await getValidatorReward.call(this)
          assertBigNumberEquality(validatorRewards.add(totalDelegatorRewardsReceived.toString()), totalExpectedRewards)
        })

        it(`total received rewards must be correct`, async function () {
          const validatorRewards = await getValidatorReward.call(this)
          const totalReceived = validatorRewards.add(totalDelegatorRewardsReceived.toString())

          const stakeManagerValidator = this.stakeManager.connect(
            this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
          )
          await stakeManagerValidator.withdrawRewards(this.validatorId)

          const tokensLeft = await this.polToken.balanceOf(this.stakeManager.address)

          assertBigNumberEquality(
            this.initialStakeTokenBalance
              .add(totalStaked.toString())
              .sub(totalReceived),
              //.sub(totalSlashed.toString()),
            tokensLeft
          )
        })
      })
    }

    function runWithdrawRewardsTest(timeline) {
      before(doDeploy)
      before(async function () {
        delegators = {}
        totalInitialBalance = new BN(0)
        totalStaked = new BN(0)
        //totalSlashed = new BN(0)
        totalDelegatorRewardsReceived = new BN(0)
        this.initialStakeTokenBalance = await this.polToken.balanceOf(this.stakeManager.address)
      })

      for (const step of timeline) {
        // if (step.slash) {
        //   testSlash(step.slash)
        // } else 
        if (step.stake) {
          testStake(step.stake)
        } else if (step.checkpoints) {
          testCheckpoint(step.checkpoints)
        } else if (step.withdraw) {
          testWithdraw(step.withdraw)
        } else if (step.liquidRewards) {
          testLiquidRewards(step.liquidRewards)
        } else if (step.allRewards) {
          testAllRewardsReceived(step.allRewards)
        }
      }
    }

    describe('when Alice purchases voucher after checkpoint', function () {
      runWithdrawRewardsTest([
        { checkpoints: 1 },
        { stake: { user: Alice, label: 'Alice', amount: new BN(wei100) } },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: '0' } },
        { allRewards: { validatorReward: toWei('9000'), totalExpectedRewards: toWei('9000') } }
      ])
    })

    describe('when Alice is not slashed. 1 checkpoint passed', function () {
      runWithdrawRewardsTest([
        { stake: { user: Alice, label: 'Alice', amount: new BN(wei100) } },
        { checkpoints: 1 },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
        { allRewards: { validatorReward: toWei('4500'), totalExpectedRewards: toWei('9000') } }
      ])
    })

    //slashing currently disabled
    describe.skip('when Alice is slashed by 50% and Bob purchases voucher after', function () {
      describe('when 1 checkpoint passes', function () {
        describe('when Alice and Bob withdraw rewards after', function () {
          runWithdrawRewardsTest([
            { stake: { user: Alice, label: 'Alice', amount: new BN(wei100) } },
            { slash: { amount: new BN(toWei('100')) } },
            { stake: { user: Bob, label: 'Bob', amount: new BN(wei100) } },
            { checkpoints: 1 },
            { withdraw: { label: 'Alice', user: Alice, expectedReward: toWei('2250') } },
            { withdraw: { label: 'Bob', user: Bob, expectedReward: toWei('4500') } },
            { allRewards: { validatorReward: toWei('2250'), totalExpectedRewards: toWei('9000') } }
          ])
        })
      })

      describe('when 2 checkpoints pass', function () {
        describe('when Alice and Bob withdraw rewards after', function () {
          runWithdrawRewardsTest([
            { stake: { user: Alice, label: 'Alice', amount: new BN(wei100) } },
            { slash: { amount: new BN(toWei('100')) } },
            { stake: { user: Bob, label: 'Bob', amount: new BN(wei100) } },
            { checkpoints: 2 },
            { liquidRewards: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
            { liquidRewards: { user: Bob, label: 'Bob', expectedReward: toWei('9000') } },
            { withdraw: { label: 'Alice', user: Alice, expectedReward: toWei('4500') } },
            { withdraw: { label: 'Bob', user: Bob, expectedReward: toWei('9000') } },
            { allRewards: { validatorReward: toWei('4500'), totalExpectedRewards: toWei('18000') } }
          ])
        })
      })
    })

    describe.skip('when Alice is slashed after checkpoint', function () {
      runWithdrawRewardsTest([
        { stake: { user: Alice, label: 'Alice', amount: new BN(wei100) } },
        { checkpoints: 1 },
        { slash: { amount: new BN(toWei('100')) } },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
        { withdraw: { label: 'Alice', user: Alice, expectedReward: toWei('4500') } },
        { allRewards: { validatorReward: toWei('4500'), totalExpectedRewards: toWei('9000') } }
      ])
    })

    describe('Alice, Bob, Eve and Carol stake #1', function () {
      runWithdrawRewardsTest([
        { stake: { user: Alice, label: 'Alice', amount: new BN(toWei('100')) } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
        { stake: { user: Bob, label: 'Bob', amount: new BN(toWei('500')) } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: '5785714285714285714285' } },
        { liquidRewards: { user: Bob, label: 'Bob', expectedReward: '6428571428571428571428' } },
        { stake: { user: Carol, label: 'Carol', amount: new BN(toWei('500')) } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: '6535714285714285714285' } },
        { liquidRewards: { user: Bob, label: 'Bob', expectedReward: '10178571428571428571428' } },
        { liquidRewards: { user: Carol, label: 'Carol', expectedReward: '3750000000000000000000' } },
        { stake: { user: Eve, label: 'Eve', amount: new BN(toWei('500')), initialBalance: new BN(1) } },
        { checkpoints: 1 },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: '7065126050420168067226' } },
        { withdraw: { user: Bob, label: 'Bob', expectedReward: '12825630252100840336133' } },
        { withdraw: { user: Carol, label: 'Carol', expectedReward: '6397058823529411764705' } },
        { withdraw: { user: Eve, label: 'Eve', expectedReward: '2647058823529411764705', initialBalance: new BN(1) } },
        { allRewards: { validatorReward: '7065126050420168067226', totalExpectedRewards: '35999999999999999999995' } }
      ])
    })

    describe.skip('Alice, Bob, Eve and Carol stake #2', function () {
      runWithdrawRewardsTest([
        { stake: { user: Alice, label: 'Alice', amount: new BN(toWei('100')) } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
        { stake: { user: Bob, label: 'Bob', amount: new BN(toWei('500')) } },
        { slash: { amount: new BN(toWei('350')) } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: '5785714285714285714285' } },
        { liquidRewards: { user: Bob, label: 'Bob', expectedReward: '6428571428571428571428' } },
        { stake: { user: Carol, label: 'Carol', amount: new BN(toWei('500')) } },
        { slash: { amount: new BN(toWei('425')), nonce: 2 } },
        { checkpoints: 1 },
        { liquidRewards: { user: Alice, label: 'Alice', expectedReward: '6315126050420168067226' } },
        { liquidRewards: { user: Bob, label: 'Bob', expectedReward: '9075630252100840336133' } },
        { liquidRewards: { user: Carol, label: 'Carol', expectedReward: '5294117647058823529411' } },
        { slash: { amount: new BN(toWei('215')), nonce: 3 } },
        { stake: { user: Eve, label: 'Eve', amount: new BN(toWei('500')), initialBalance: new BN(1) } },
        { checkpoints: 1 },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: '6471712628713457213871' } },
        { withdraw: { user: Bob, label: 'Bob', expectedReward: '9858563143567286069357' } },
        { withdraw: { user: Carol, label: 'Carol', expectedReward: '6859983429991714995859' } },
        { withdraw: { user: Eve, label: 'Eve', expectedReward: '6338028169014084507041', initialBalance: new BN(1) } },
        { allRewards: { validatorReward: '6471712628713457213867', totalExpectedRewards: '35999999999999999999995' } }
      ])
    })

    describe('when not enough rewards', function () {
      before(doDeploy)

      it('reverts', async function () {
        const validatorContractAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(Alice))
        await expectRevert(validatorContractAlice.withdrawRewards(), 'Too small rewards amount')
      })
    })

    describe('when Alice withdraws 2 times in a row', async function () {
      runWithdrawRewardsTest([
        { stake: { user: Alice, label: 'Alice', amount: new BN(toWei('100')) } },
        { checkpoints: 1 },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: toWei('4500') } },
        { withdraw: { user: Alice, label: 'Alice', expectedReward: '0' } }
      ])
    })

    describe('when locked', function () {
      before(doDeploy)

      before(async function () {
        const amount = toWei('100')
        await this.stakeToken.mint(Alice, amount)
        const stakeTokenAlice = this.stakeToken.connect(this.stakeToken.provider.getSigner(Alice))
        await stakeTokenAlice.approve(this.stakeManager.address, amount)
        await buyVoucher(this.validatorContract, amount, Alice)
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        await this.stakeManager.testLockShareContract(this.validatorId, true)
      })

      it('must withdraw rewards', async function () {
        const validatorContractAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(Alice))
        this.receipt = await (await validatorContractAlice.withdrawRewards()).wait()
      })

      shouldWithdrawReward({
        initialBalance: new BN('0'),
        validatorId: '8',
        user: Alice,
        reward: toWei('4500')
      })
    })

    describe('when validator unstaked', function () {
      before(doDeploy)
      before(async function () {
        const amount = toWei('100')
        await this.stakeToken.mint(Alice, amount)
        const stakeTokenAlice = this.stakeToken.connect(this.stakeToken.provider.getSigner(Alice))
        await stakeTokenAlice.approve(this.stakeManager.address, amount)
        await buyVoucher(this.validatorContract, amount, Alice)
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        const stakeManagerAlice = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerAlice.unstake(this.validatorId)
        await this.stakeManager.advanceEpoch(Dynasty)
      })

      it('must withdraw rewards', async function () {
        const validatorContractAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(Alice))
        this.receipt = await (await validatorContractAlice.withdrawRewards()).wait()
      })

      shouldWithdrawReward({
        initialBalance: new BN('0'),
        validatorId: '8',
        user: Alice,
        reward: toWei('4500')
      })
    })

    // slashing is currently disabled
    describe.skip('when all tokens are slashed', function () {
      before(doDeploy)
      before('slash', async function () {
        const amount = toWei('100')
        await this.stakeToken.mint(Alice, amount)
        const stakeTokenAlice = this.stakeToken.connect(this.stakeToken.provider.getSigner(Alice))
        await stakeTokenAlice.approve(this.stakeManager.address, amount)
        await buyVoucher(this.validatorContract, amount, Alice)
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        await slash.call(
          this,
          [
            {
              validator: this.validatorId,
              amount: new BN((await this.stakeManager.currentValidatorSetTotalStake()).toString())
            }
          ],
          [this.validatorUser],
          this.validatorUser
        )
      })

      it('must withdraw rewards', async function () {
        const validatorContractAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(Alice))
        this.receipt = await (await validatorContractAlice.withdrawRewards()).wait()
      })

      shouldWithdrawReward({
        initialBalance: new BN(0),
        validatorId: '8',
        user: Alice,
        reward: toWei('4500')
      })
    })
  })

  describe('restake', function () {
    function prepareForTest({ skipCheckpoint } = {}) {
      before(doDeploy)
      before(async function () {
        this.user = wallets[2].getChecksumAddressString()

        await this.stakeToken.mint(this.user, this.stakeAmount.toString())
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
        await stakeTokenUser.approve(this.stakeManager.address, this.stakeAmount.toString())

        await buyVoucher(this.validatorContract, this.stakeAmount.toString(), this.user)
        this.shares = await this.validatorContract.balanceOf(this.user)

        if (!skipCheckpoint) {
          await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        }
      })
    }

    describe('when Alice restakes', function () {
      const voucherValueExpected = new BN(toWei('4500'))
      const reward = new BN(toWei('4500'))
      const userTotalStaked = new BN(toWei('4600'))
      const shares = new BN(toWei('4500'))
      const totalStaked = new BN(toWei('4700'))
      const initialBalance = new BN(toWei('100'))

      prepareForTest()

      it('must restake', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        this.receipt = await (await validatorUser.restake()).wait()
      })

      shouldBuyShares({
        voucherValueExpected,
        userTotalStaked,
        totalStaked,
        shares,
        reward,
        initialBalance
      })

      shouldWithdrawReward({
        reward: '0', // we need only partial test here, reward is not really claimed
        initialBalance,
        checkBalance: false,
        validatorId: '8'
      })

      it('must emit DelegatorRestaked', async function () {
        assertInTransaction(this.receipt, StakingInfo, 'DelegatorRestaked', {
          validatorId: this.validatorId,
          totalStaked: userTotalStaked.toString()
        })
      })
    })

    describe('when no liquid rewards', function () {
      prepareForTest({ skipCheckpoint: true })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(validatorUser.restake(), 'Too small rewards to restake')
      })
    })

    describe('when staking manager delegation is disabled', function () {
      prepareForTest()

      before('disable delegation', async function () {
        await this.governance.update(
          this.stakeManager.address,
          this.stakeManager.interface.encodeFunctionData('setDelegationEnabled', [false])
        )
      })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(validatorUser.restake(), 'Delegation is disabled')
      })
    })

    describe('when validator unstaked', function () {
      prepareForTest()
      before(async function () {
        const stakeManagerValidator = this.stakeManager.connect(
          this.stakeManager.provider.getSigner(this.validatorUser.getChecksumAddressString())
        )
        await stakeManagerValidator.unstake(this.validatorId)
      })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(validatorUser.restake(), 'locked')
      })
    })

    describe('when locked', function () {
      prepareForTest()

      before(async function () {
        await this.stakeManager.testLockShareContract(this.validatorId, true)
      })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(validatorUser.restake(), 'locked')
      })
    })
  })

  describe('unstakeClaimTokens', function () {
    function prepareForTest({ skipSell, skipBuy } = {}) {
      before(doDeploy)
      before(async function () {
        this.user = wallets[2].getChecksumAddressString()

        await this.stakeToken.mint(this.user, this.stakeAmount.toString())
        const stakeTokenUser = this.stakeToken.connect(this.stakeToken.provider.getSigner(this.user))
        await stakeTokenUser.approve(this.stakeManager.address, this.stakeAmount.toString())

        this.totalStaked = this.stakeAmount
      })

      if (!skipBuy) {
        before('buy', async function () {
          await buyVoucher(this.validatorContract, this.stakeAmount.toString(), this.user)
        })
      }

      if (!skipSell) {
        before('sell', async function () {
          await sellVoucher(this.validatorContract, this.user)
        })
      }
    }

    describe('when Alice unstakes right after voucher sell', function () {
      prepareForTest()

      before('checkpoint', async function () {
        let currentEpoch = await this.stakeManager.currentEpoch()
        let exitEpoch = currentEpoch.add(await this.stakeManager.WITHDRAWAL_DELAY())

        for (let i = currentEpoch; i <= exitEpoch; i++) {
          await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        }
      })

      it('must unstake', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        this.receipt = await (await validatorUser.unstakeClaimTokens()).wait()
      })

      it('must emit DelegatorUnstaked', async function () {
        assertInTransaction(this.receipt, StakingInfo, 'DelegatorUnstaked', {
          validatorId: this.validatorId,
          user: this.user,
          amount: this.stakeAmount.toString()
        })
      })

      shouldHaveCorrectStakes({
        userTotalStaked: '0',
        totalStaked: toWei('100')
      })
    })

    describe('when Alice claims too early', function () {
      prepareForTest()

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(
          validatorUser.unstakeClaimTokens(),
          'Incomplete withdrawal period'
        )
      })
    })

    describe('when Alice claims with 0 shares', function () {
      prepareForTest({ skipSell: true })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(
          validatorUser.unstakeClaimTokens(),
          'Incomplete withdrawal period'
        )
      })
    })

    describe("when Alice didn't buy voucher", function () {
      prepareForTest({ skipSell: true, skipBuy: true })

      it('reverts', async function () {
        const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
        await expectRevert(
          validatorUser.unstakeClaimTokens(),
          'Incomplete withdrawal period'
        )
      })
    })

    describe('new API', function () {
      describe('when Alice claims 2 seperate unstakes (1 epoch between unstakes)', function () {
        prepareForTest({ skipSell: true })

        before('sell shares twice', async function () {
          this.claimAmount = this.stakeAmount.div(new BN('2'))

          await sellVoucherNew(this.validatorContract, this.user, this.claimAmount)
          await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
          await sellVoucherNew(this.validatorContract, this.user, this.claimAmount)
        })

        before('checkpoint', async function () {
          let currentEpoch = await this.stakeManager.currentEpoch()
          let exitEpoch = currentEpoch.add(await this.stakeManager.WITHDRAWAL_DELAY())

          for (let i = currentEpoch; i <= exitEpoch; i++) {
            await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
          }
        })

        it('must claim 1st unstake', async function () {
          const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
          this.receipt = await (await validatorUser.unstakeClaimTokens_new('1')).wait()
        })

        it('must emit DelegatorUnstakeWithId', async function () {
          assertInTransaction(this.receipt, EventsHub, 'DelegatorUnstakeWithId', {
            validatorId: this.validatorId,
            user: this.user,
            amount: this.claimAmount.toString(),
            nonce: '1'
          })
        })

        it('must claim 2nd unstake', async function () {
          const validatorUser = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.user))
          this.receipt = await (await validatorUser.unstakeClaimTokens_new('2')).wait()
        })

        it('must emit DelegatorUnstakeWithId', async function () {
          assertInTransaction(this.receipt, EventsHub, 'DelegatorUnstakeWithId', {
            validatorId: this.validatorId,
            user: this.user,
            amount: this.claimAmount.toString(),
            nonce: '2'
          })
        })

        it('must have 0 shares', async function () {
          assertBigNumberEquality(await this.validatorContract.balanceOf(this.user), '0')
        })
      })
    })
  })

  describe('getLiquidRewards', function () {
    describe('when Alice and Bob buy vouchers (1 checkpoint in-between) and Alice withdraw the rewards', function () {
      deployAliceAndBob()
      before(async function () {
        await buyVoucher(this.validatorContract, toWei('100'), this.alice)
        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
        await buyVoucher(this.validatorContract, toWei('4600'), this.bob)
        const validatorAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.alice))
        await validatorAlice.withdrawRewards()
      })

      it('Bob must call getLiquidRewards', async function () {
        await this.validatorContract.getLiquidRewards(this.bob)
      })
    })
  })

  describe('transfer', function () {
    describe('when Alice has no rewards', function () {
      deployAliceAndBob()

      let initialSharesBalance

      before('Alice purchases voucher', async function () {
        await buyVoucher(this.validatorContract, toWei('100'), this.alice)
        initialSharesBalance = await this.validatorContract.balanceOf(this.alice)
      })

      it('must Transfer shares', async function () {
        const validatorAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.alice))
        await validatorAlice.transfer(this.bob, initialSharesBalance)
      })

      it('Alice must have 0 shares', async function () {
        assertBigNumberEquality(await this.validatorContract.balanceOf(this.alice), '0')
      })

      it("Bob must have Alice's shares", async function () {
        assertBigNumberEquality(await this.validatorContract.balanceOf(this.bob), initialSharesBalance)
      })
    })

    describe('when Alice and Bob have unclaimed rewards', function () {
      deployAliceAndBob()

      let initialAliceSharesBalance
      let initialBobSharesBalance

      let initialAliceMaticBalance
      let initialBobMaticBalance

      before('Alice and Bob purchases voucher, checkpoint is commited', async function () {
        await buyVoucher(this.validatorContract, ValidatorDefaultStake, this.alice)
        await buyVoucher(this.validatorContract, ValidatorDefaultStake, this.bob)

        initialAliceSharesBalance = await this.validatorContract.balanceOf(this.alice)
        initialBobSharesBalance = await this.validatorContract.balanceOf(this.bob)

        initialAliceMaticBalance = await this.stakeToken.balanceOf(this.alice)
        initialBobMaticBalance = await this.stakeToken.balanceOf(this.bob)

        await checkPoint([this.validatorUser], this.rootChainOwner, this.stakeManager)
      })

      it('must Transfer shares', async function () {
        const validatorAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.alice))
        this.receipt = await (await validatorAlice.transfer(this.bob, initialAliceSharesBalance)).wait()
      })

      it('must emit DelegatorClaimedRewards for Alice', async function () {
        assertInTransaction(this.receipt, StakingInfo, 'DelegatorClaimedRewards', {
          validatorId: this.validatorId,
          user: this.alice,
          rewards: toWei('3000')
        })
      })

      it('Alice must claim 3000 matic', async function () {
        assertBigNumberEquality(
          await this.stakeToken.balanceOf(this.alice),
          initialAliceMaticBalance.add(toWei('3000'))
        )
      })

      it('Alice must have 0 liquid rewards', async function () {
        assertBigNumberEquality(await this.validatorContract.getLiquidRewards(this.alice), '0')
      })

      it('Alice must have 0 shares', async function () {
        assertBigNumberEquality(await this.validatorContract.balanceOf(this.alice), '0')
      })

      it("Bob must have Alice's shares", async function () {
        assertBigNumberEquality(
          await this.validatorContract.balanceOf(this.bob),
          initialBobSharesBalance.add(initialAliceSharesBalance)
        )
      })

      it('must emit DelegatorClaimedRewards for Bob', async function () {
        assertInTransaction(this.receipt, StakingInfo, 'DelegatorClaimedRewards', {
          validatorId: this.validatorId,
          user: this.bob,
          rewards: toWei('3000')
        })
      })

      it('Bob must claim 3000 matic', async function () {
        assertBigNumberEquality(
          await this.stakeToken.balanceOf(this.bob),
          initialBobMaticBalance.add(toWei('3000'))
        )
      })

      it('Bob must have 0 liquid rewards', async function () {
        assertBigNumberEquality(await this.validatorContract.getLiquidRewards(this.bob), '0')
      })
    })

    describe('when transfer to 0x0 address', function () {
      deployAliceAndBob()

      let initialAliceSharesBalance

      before('Alice purchases voucher', async function () {
        initialAliceSharesBalance = await this.validatorContract.balanceOf(this.alice)

        await buyVoucher(this.validatorContract, ValidatorDefaultStake, this.alice)
      })

      it('reverts', async function () {
        const validatorAlice = this.validatorContract.connect(this.validatorContract.provider.getSigner(this.alice))
        await expectRevert.unspecified(
          validatorAlice.transfer(ZeroAddr, initialAliceSharesBalance)
        )
      })
    })
  })
})

function shouldHaveCorrectStakes({ user, userTotalStaked, totalStaked }) {
  it('must have correct total staked', async function () {
    const result = await this.validatorContract.amountStaked(user || this.user)
    assertBigNumberEquality(result, userTotalStaked)
  })

  it('validator state must have correct amount', async function () {
    assertBigNumberEquality(await this.stakeManager.currentValidatorSetTotalStake(), totalStaked)
  })
}

function shouldBuyShares({ shares, voucherValueExpected, totalStaked }) {
  it('ValidatorShare must mint correct amount of shares', async function () {
    assertInTransaction(this.receipt, ValidatorShare, 'Transfer', {
      from: ZeroAddr,
      to: this.user,
      value: shares.toString()
    })
  })

  it('must emit ShareMinted', async function () {
    assertInTransaction(this.receipt, StakingInfo, 'ShareMinted', {
      validatorId: this.validatorId,
      user: this.user,
      amount: voucherValueExpected.toString(),
      tokens: shares.toString()
    })
  })

  it('must emit StakeUpdate', async function () {
    assertInTransaction(this.receipt, StakingInfo, 'StakeUpdate', {
      validatorId: this.validatorId,
      newAmount: totalStaked.toString()
    })
  })
}

function shouldWithdrawReward({ initialBalance, validatorId, user, reward, checkBalance = true, pol = false }) {
  if (reward > 0) {
    it('must emit Transfer', async function () {
      assertInTransaction(this.receipt, TestToken, 'Transfer', {
        from: this.stakeManager.address,
        to: user || this.user,
        value: reward
      })
    })

    it('must emit DelegatorClaimedRewards', async function () {
      assertInTransaction(this.receipt, StakingInfo, 'DelegatorClaimedRewards', {
        validatorId: validatorId.toString(),
        user: user || this.user,
        rewards: reward.toString()
      })
    })
  }

  if (checkBalance) {
    if (pol) {
      it('must have updated balance', async function () {
        const balance = await this.polToken.balanceOf(user || this.user)
        assertBigNumberEquality(balance, new BN(initialBalance).add(new BN(reward)))
      })
    } else {
      it('must have updated balance', async function () {
        const balance = await this.stakeToken.balanceOf(user || this.user)
        assertBigNumberEquality(balance, new BN(initialBalance).add(new BN(reward)))
      })
    }
  }

  it('must have liquid rewards == 0', async function () {
    let rewards = await this.validatorContract.getLiquidRewards(user || this.user)
    assertBigNumberEquality('0', rewards)
  })

  it('must have correct initialRewardPerShare', async function () {
    const currentRewardPerShare = await this.validatorContract.rewardPerShare()
    const userRewardPerShare = await this.validatorContract.initalRewardPerShare(user || this.user)
    assertBigNumberEquality(currentRewardPerShare, userRewardPerShare)
  })
}
