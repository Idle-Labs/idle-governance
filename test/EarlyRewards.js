const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const EarlyRewards = artifacts.require('EarlyRewards');
const TokenMock = artifacts.require('TokenMock');

const BNify = n => new BN(String(n));

contract('EarlyRewards', function ([_, creator, nonOwner, someone, foo, manager, feeReceiver]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // mainnet
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';
    this.fooAddr = '0x0000000000000000000000000000000000000003';

    this.idle = await TokenMock.new({from: creator});
    this.fakeToken = await TokenMock.new({from: creator});
    this.early = await EarlyRewards.new(this.idle.address, this.someAddr, BNify('0'), {from: creator});
  });

  it('set params on constructor', async function () {
    const val = BNify('10000');
    (await this.early.IDLE()).should.be.equal(this.idle.address);
    (await this.early.ecosystemFund()).should.be.equal(this.someAddr);
    (await this.early.claimDeadline()).should.be.bignumber.equal(BNify('0'));
    (await this.early.canSetReward()).should.be.equal(true);
  });

  it('allows onlyOwner to setRewards', async function () {
    await this.early.setRewards([someone, nonOwner], [BNify('10'), BNify('100')], { from: creator });
    (await this.early.rewards(someone)).should.be.bignumber.equal(BNify('10'));
    (await this.early.rewards(nonOwner)).should.be.bignumber.equal(BNify('100'));

    await expectRevert.unspecified(this.early.setRewards([someone], [BNify('10')], { from: nonOwner }));
  });
  it('setRewards reverts if params have different length', async function () {
    await expectRevert.unspecified(this.early.setRewards([someone], [BNify('10'), BNify('100')], { from: creator }));
  });
  it('setRewards reverts if canSetReward is false', async function () {
    await this.early.stopSettingRewards({from: creator});
    await expectRevert.unspecified(this.early.setRewards([someone], [BNify('10'), BNify('100')], { from: creator }));
  });
  it('recipient can claim', async function () {
    await this.idle.transfer(this.early.address, BNify('10000'), {from: creator});

    await this.early.setRewards([nonOwner, someone], [BNify('100'), BNify('10')], { from: creator });
    await this.early.claim({from: nonOwner});

    const balNonOwner = await this.idle.balanceOf(nonOwner);
    BNify(balNonOwner).should.be.bignumber.equal(BNify('100'));
  });
  it('claim reverts if msg.sender is not authorized', async function () {
    await this.idle.transfer(this.early.address, BNify('10000'), {from: creator});
    await this.early.setRewards([nonOwner, someone], [BNify('100'), BNify('10')], { from: creator });
    await expectRevert.unspecified(this.early.claim({from: foo }));
  });
  it('emergencyWithdrawal can only be called by owner can claim', async function () {
    await expectRevert.unspecified(this.early.emergencyWithdrawal(this.idle.address, nonOwner, BNify('10'), { from: nonOwner }));
  });
  it('emergencyWithdrawal can be called by owner for any non IDLE token', async function () {
    await this.fakeToken.transfer(this.early.address, BNify('10'), {from: creator});

    await this.early.emergencyWithdrawal(this.fakeToken.address, nonOwner, BNify('10'), { from: creator });
    const balNonOwner = await this.fakeToken.balanceOf(nonOwner);
    BNify(balNonOwner).should.be.bignumber.equal(BNify('10'));
  });
  it('emergencyWithdrawal can be called by owner for IDLE token with any address but fund goes to ecosystem', async function () {
    await this.idle.transfer(this.early.address, BNify('10'), {from: creator});

    await this.early.emergencyWithdrawal(this.idle.address, nonOwner, BNify('0'), { from: creator });
    const balEco = await this.idle.balanceOf(this.someAddr);
    BNify(balEco).should.be.bignumber.equal(BNify('10'));
  });
});
