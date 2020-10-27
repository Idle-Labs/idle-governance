const { expectEvent, singletons, constants, BN, expectRevert, time } = require('@openzeppelin/test-helpers');

const Reservoir = artifacts.require('Reservoir');
const TokenMock = artifacts.require('TokenMock');

const BNify = n => new BN(String(n));

contract('Reservoir', function ([_, creator, nonOwner, someone, foo, manager, feeReceiver]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.one8 = new BN('100000000');
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';
    this.fooAddr = '0x0000000000000000000000000000000000000003';

    this.token = await TokenMock.new({from: creator});
  });

  it('drips with no bonus', async function () {
    const reservoir = await Reservoir.new(
      BNify('2').mul(this.one), // rate per block
      this.token.address,
      this.someAddr, // target
      BNify('1'), // multiplier
      {from: creator}
    );
    // 1 block mined
    await this.token.transfer(reservoir.address, BNify('100').mul(this.one), {from: creator});
    await time.advanceBlock(); // 1 block mined
    await reservoir.drip({ from: creator }); // 1 block mined

    // tot 3 blocks mined * 2 token per block = 6
    (await this.token.balanceOf(this.someAddr)).should.be.bignumber.equal(BNify('6').mul(this.one));
  });

  it('drips with bonus', async function () {
    const reservoir = await Reservoir.new(
      BNify('2').mul(this.one), // rate per block
      this.token.address,
      this.someAddr, // target
      BNify('2'), // multiplier
      {from: creator}
    );
    // 1 block mined
    await this.token.transfer(reservoir.address, BNify('100').mul(this.one), {from: creator});
    await time.advanceBlock(); // 1 block mined
    await reservoir.drip({ from: creator }); // 1 block mined

    // tot 3 blocks mined * (2 token per block * 2 multiplier) = 12
    (await this.token.balanceOf(this.someAddr)).should.be.bignumber.equal(BNify('12').mul(this.one));
  });

  it('drips after bonus has finished', async function () {
    const reservoir = await Reservoir.new(
      BNify('2').mul(this.one), // rate per block
      this.token.address,
      this.someAddr, // target
      BNify('2'), // multiplier
      {from: creator}
    );
    // 1 block mined
    await this.token.transfer(reservoir.address, BNify('100').mul(this.one), {from: creator});
    await time.advanceBlock(); // 1 block mined
    await reservoir.drip({ from: creator }); // 1 block mined

    // tot 3 blocks mined * (2 token per block * 2 multiplier) = 12
    (await this.token.balanceOf(this.someAddr)).should.be.bignumber.equal(BNify('12').mul(this.one));

    await time.increase('5184000'); // 60 days -> 1 block mined
    await time.advanceBlock(); // 1 block mined
    await reservoir.drip({ from: creator }); // 1 block mined

    // tot 3 blocks mined * (2 token per block * 1 multiplier) = 6 (+ 12 before)
    (await this.token.balanceOf(this.someAddr)).should.be.bignumber.equal(BNify('18').mul(this.one));
  });
});
