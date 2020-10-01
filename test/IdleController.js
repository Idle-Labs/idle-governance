const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const PriceOracleMock = artifacts.require('PriceOracleMock');
const IdleController = artifacts.require('IdleController');
const TokenMock = artifacts.require('TokenMock');
const IdleTokenMock = artifacts.require('IdleTokenMock');

const BNify = n => new BN(String(n));

contract('PriceOracle', function ([_, creator, nonOwner, someone, foo, manager, feeReceiver]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';
    this.fooAddr = '0x0000000000000000000000000000000000000003';

    this.foo = await TokenMock.new({from: creator});
    this.token = await TokenMock.new({from: creator});
    this.idleToken = await IdleTokenMock.new({from: creator});
    this.idleToken2 = await IdleTokenMock.new({from: creator});
    this.idleToken3 = await IdleTokenMock.new({from: creator});
    this.oracle = await PriceOracleMock.new({from: creator});
    this.idleTroll = await IdleController.new(this.oracle.address, this.token.address, {from: creator});

    await this.idleToken.setToken(this.foo.address, {from: creator});

    await this.idleToken2.setToken(this.foo.address, {from: creator});
    await this.idleToken2.setTokenPrice(this.one, {from: creator});
    await this.idleToken2.setApr(BNify('2').mul(this.one), {from: creator});

    await this.idleToken3.setToken(this.foo.address, {from: creator});
    await this.idleToken3.setTokenPrice(this.one, {from: creator});
    await this.idleToken3.setApr(BNify('2').mul(this.one), {from: creator});

    await this.idleTroll._supportMarkets([this.idleToken2.address, this.idleToken3.address], {from: creator});
    await this.idleTroll._addIdleMarkets([this.idleToken2.address, this.idleToken3.address], {from: creator});
    await this.idleTroll._setIdleRate(BNify('500000000000000000'), {from: creator}); // 0.5 IDLE per block

    await this.oracle.setLatestAnswer(this.idleToken2.address, BNify('1').mul(this.one));
    await this.oracle.setLatestAnswer(this.idleToken3.address, BNify('1').mul(this.one));

    const idleSpeeds2 = await this.idleTroll.idleSpeeds(this.idleToken2.address);
    const idleSpeeds3 = await this.idleTroll.idleSpeeds(this.idleToken3.address);

    const setAprsTotSupply = async (aprs, supplies) => {
      await this.idleToken3.setApr(aprs[0].mul(this.one), {from: creator});
      await this.idleToken3.addTotalSupply(supplies[0].mul(this.one), {from: creator});
      await this.idleToken3.setApr(aprs[1].mul(this.one), {from: creator});
      await this.idleToken3.addTotalSupply(supplies[1].mul(this.one), {from: creator});
    }
  });

  it('refreshIdleSpeeds with IDLE equally splitted', async function () {
    await this.idleToken2.addTotalSupply(BNify('1').mul(this.one));
    await this.idleToken3.addTotalSupply(BNify('1').mul(this.one));

    const val = BNify('250000000000000000');
    await this.idleTroll.refreshIdleSpeeds({ from: creator });
    (await this.idleTroll.idleSpeeds(this.idleToken2.address)).should.be.bignumber.equal(val);
    (await this.idleTroll.idleSpeeds(this.idleToken3.address)).should.be.bignumber.equal(val);
  });

  it('refreshIdleSpeeds with different supply', async function () {
    await this.idleToken2.setTokenPrice(this.one, {from: creator});
    await this.idleToken2.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken2.addTotalSupply(BNify('4').mul(this.one));

    await this.idleToken3.setTokenPrice(this.one, {from: creator});
    await this.idleToken3.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken3.addTotalSupply(BNify('1').mul(this.one));

    await this.idleTroll.refreshIdleSpeeds({ from: creator });
    (await this.idleTroll.idleSpeeds(this.idleToken2.address)).should.be.bignumber.equal(BNify('400000000000000000'));
    (await this.idleTroll.idleSpeeds(this.idleToken3.address)).should.be.bignumber.equal(BNify('100000000000000000'));
  });

  it('refreshIdleSpeeds with different price', async function () {
    await this.idleToken2.setTokenPrice(BNify('4').mul(this.one), {from: creator});
    await this.idleToken2.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken2.addTotalSupply(BNify('1').mul(this.one));

    await this.idleToken3.setTokenPrice(this.one, {from: creator});
    await this.idleToken3.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken3.addTotalSupply(BNify('1').mul(this.one));

    await this.idleTroll.refreshIdleSpeeds({ from: creator });
    (await this.idleTroll.idleSpeeds(this.idleToken2.address)).should.be.bignumber.equal(BNify('400000000000000000'));
    (await this.idleTroll.idleSpeeds(this.idleToken3.address)).should.be.bignumber.equal(BNify('100000000000000000'));
  });

  it('refreshIdleSpeeds with different aprs', async function () {
    await this.idleToken2.setTokenPrice(BNify('1').mul(this.one), {from: creator});
    await this.idleToken2.setApr(BNify('8').mul(this.one), {from: creator});
    await this.idleToken2.addTotalSupply(BNify('1').mul(this.one));

    await this.idleToken3.setTokenPrice(this.one, {from: creator});
    await this.idleToken3.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken3.addTotalSupply(BNify('1').mul(this.one));

    await this.idleTroll.refreshIdleSpeeds({ from: creator });
    (await this.idleTroll.idleSpeeds(this.idleToken2.address)).should.be.bignumber.equal(BNify('400000000000000000'));
    (await this.idleTroll.idleSpeeds(this.idleToken3.address)).should.be.bignumber.equal(BNify('100000000000000000'));
  });

  it('refreshIdleSpeeds with different asset prices', async function () {
    await this.idleToken2.setTokenPrice(BNify('1').mul(this.one), {from: creator});
    await this.idleToken2.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken2.addTotalSupply(BNify('1').mul(this.one));
    await this.oracle.setLatestAnswer(this.idleToken2.address, BNify('4').mul(this.one));

    await this.idleToken3.setTokenPrice(this.one, {from: creator});
    await this.idleToken3.setApr(BNify('2').mul(this.one), {from: creator});
    await this.idleToken3.addTotalSupply(BNify('1').mul(this.one));
    await this.oracle.setLatestAnswer(this.idleToken3.address, BNify('1').mul(this.one));

    await this.idleTroll.refreshIdleSpeeds({ from: creator });
    (await this.idleTroll.idleSpeeds(this.idleToken2.address)).should.be.bignumber.equal(BNify('400000000000000000'));
    (await this.idleTroll.idleSpeeds(this.idleToken3.address)).should.be.bignumber.equal(BNify('100000000000000000'));
  });
});
