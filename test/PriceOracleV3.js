const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');
const { deployProxy, upgradeProxy } = require('@openzeppelin/truffle-upgrades');

const PriceOracleV3 = artifacts.require('PriceOracleV3');
const ChainLinkOracleV3Mock = artifacts.require('ChainLinkOracleV3Mock');
const TokenMock = artifacts.require('TokenMock');
const IdleTokenMock = artifacts.require('IdleTokenMock');
const CERC20Mock = artifacts.require('CERC20Mock');
const ATokenMock = artifacts.require('ATokenMock');
const ComptrollerMock = artifacts.require('ComptrollerMock');
const AaveControllerMock = artifacts.require('AaveControllerMock');

const BNify = n => new BN(String(n));

contract('PriceOracleV3', function ([_, creator, nonOwner, someone, foo, manager, feeReceiver]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.oneRay = new BN('1000000000000000000000000000');
    this.oneAToken = this.one; // TODO should be equal to underlying decimals
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // mainnet
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';
    this.fooAddr = '0x0000000000000000000000000000000000000003';

    this.comptroller = await ComptrollerMock.new({from: creator});
    this.aaveController = await AaveControllerMock.new({from: creator});
    this.aDAI = await ATokenMock.new(this.aaveController.address, {from: creator});
    this.cDAI = await CERC20Mock.new(this.comptroller.address, {from: creator});
    this.foo = await TokenMock.new({from: creator});
    this.token = await TokenMock.new({from: creator});
    this.idleToken = await IdleTokenMock.new({from: creator});
    this.chain = await ChainLinkOracleV3Mock.new({from: creator});
    this.chainFoo = await ChainLinkOracleV3Mock.new({from: creator});
    this.chainETH = await ChainLinkOracleV3Mock.new({from: creator});
    this.oracle = await PriceOracleV3.new({from: creator});
    await this.oracle.initialize({ from: creator });

    await this.oracle.updateFeedUSD(this.WETH, this.chain.address, {from: creator});
    await this.oracle.updateFeedUSD('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', this.chain.address, {from: creator}); // wbtc
    await this.oracle.updateFeedUSD('0xc00e94Cb662C3520282E6f5717214004A7f26888', this.chain.address, {from: creator}); // COMP mainnet
    await this.oracle.updateFeedUSD('0x4da27a545c0c5B758a6BA100e3a049001de870f5', this.chain.address, {from: creator});
    await this.oracle.updateFeedETH(this.someAddr, this.chainETH.address, {from: creator});
    await this.oracle.updateFeedUSD(this.foo.address, this.chainFoo.address, {from: creator});
    await this.oracle.updateFeedETH('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', this.chainETH.address, {from: creator});
    await this.oracle.updateFeedETH('0x4da27a545c0c5B758a6BA100e3a049001de870f5', this.chainETH.address, {from: creator});

    await this.idleToken.setToken(this.foo.address, {from: creator});
    await this.aaveController.setSpeeds(BNify('1706018518518520'), {from: creator});
    await this.comptroller.setSpeeds(BNify('150000000000000000'), {from: creator});
  });

  it('owner should be set', async function () {
    const owner = await this.oracle.owner();
    owner.should.be.equal(creator);
  });

  it('initialize should revert after deploy', async function () {
    await expectRevert.unspecified(this.oracle.initialize({ from: creator }));
    await expectRevert.unspecified(this.oracle.initialize({ from: nonOwner }));
  });

  it('allows onlyOwner to setBlocksPerYear', async function () {
    const val = BNify('10000');
    await this.oracle.setBlocksPerYear(val, { from: creator });
    (await this.oracle.blocksPerYear()).should.be.bignumber.equal(val);

    await expectRevert.unspecified(this.oracle.setBlocksPerYear(val, { from: nonOwner }));
  });
  it('allows onlyOwner to updateFeedETH', async function () {
    await this.oracle.updateFeedETH(this.someAddr, this.someOtherAddr, { from: creator });
    (await this.oracle.priceFeedsETH(this.someAddr)).should.be.equal(this.someOtherAddr);

    await expectRevert.unspecified(this.oracle.updateFeedETH(this.someAddr, this.someOtherAddr, { from: nonOwner }));
  });
  it('allows onlyOwner to updateFeedETH', async function () {
    await this.oracle.updateFeedUSD(this.someAddr, this.someOtherAddr, { from: creator });
    (await this.oracle.priceFeedsUSD(this.someAddr)).should.be.equal(this.someOtherAddr);

    await expectRevert.unspecified(this.oracle.updateFeedUSD(this.someAddr, this.someOtherAddr, { from: nonOwner }));
  });
  it('getPriceUSD when there no price feed', async function() {
    const res = await this.oracle.getPriceUSD(this.someOtherAddr, { from: creator });
    res.should.be.bignumber.equal(BNify(0));
  });
  it('getPriceUSD when there is USD price feed', async function() {
    // set chainlink pracle response
    await this.chain.setLatestAnswer(BNify(1e8)); // 1 USD
    const res = await this.oracle.getPriceUSD(this.WETH, { from: creator });
    res.should.be.bignumber.equal(BNify(1e18));
  });
  it('getPriceUSD when there no USD price feed but ETH price feed is present', async function() {
    // set chainlink pracle response
    await this.chain.setLatestAnswer(BNify('30000000000')); // 300 usd for 1 eth
    await this.chainETH.setLatestAnswer(BNify('30').mul(this.one)); // 1 wbtc = 30eth
    // wbtc address which is present
    const res = await this.oracle.getPriceUSD(this.someAddr, { from: creator });
    res.should.be.bignumber.equal(BNify('9000').mul(this.one)); // 9000 usd per wbtc
  });
  it('getPriceETH when there no price feed', async function() {
    const res = await this.oracle.getPriceETH(this.someOtherAddr, { from: creator });
    res.should.be.bignumber.equal(BNify(0));
  });
  it('getPriceETH when there is ETH price feed', async function() {
    // set chainlink pracle response
    await this.chainETH.setLatestAnswer(BNify(1e18)); // 1 ETH
    const res = await this.oracle.getPriceETH('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', { from: creator });
    res.should.be.bignumber.equal(BNify(1e18));
  });
  it('getPriceToken when there no price feed for asset', async function() {
    const res = await this.oracle.getPriceToken(this.someOtherAddr, this.foo.address, { from: creator });
    res.should.be.bignumber.equal(BNify(0));
  });
  it('getPriceToken when there no price feed for token', async function() {
    const res = await this.oracle.getPriceToken(this.someAddr, this.someOtherAddr, { from: creator });
    res.should.be.bignumber.equal(BNify(0));
  });
  it('getPriceToken when there are both price feeds', async function() {
    await this.chain.setLatestAnswer(BNify('30000000000')); // 300 usd for 1 eth
    await this.chainETH.setLatestAnswer(BNify('2').mul(this.one)); // 1 some costs 2 ETH
    // 1 some = 600 usd
    // 1 foo = 100 usd
    await this.chainFoo.setLatestAnswer(BNify('10000000000')); // 100 usd for 1 foo
    // 1 some = 6 foo
    const res = await this.oracle.getPriceToken(this.someAddr, this.foo.address, { from: creator });
    res.should.be.bignumber.equal(BNify('6').mul(this.one));
  });
  it('getUnderlyingPrice', async function() {
    await this.chainFoo.setLatestAnswer(BNify('30000000000')); // 300 usd

    const res = await this.oracle.getUnderlyingPrice(this.idleToken.address, { from: creator });
    res.should.be.bignumber.equal(BNify('300').mul(this.one));
  });
  it('getCompApr', async function() {
    // 0.15 compSpeeds per block
    await this.chain.setLatestAnswer(BNify('20000000000')); // 200 usd for 1 COMP
    await this.chainFoo.setLatestAnswer(BNify('100000000')); // 1 usd for 1 foo

    const res = await this.oracle.getCompApr(this.cDAI.address, this.foo.address, { from: creator });
    res.should.be.bignumber.equal(BNify('35571420000000000000')); // 35%
  });

  it('getStkAaveApr', async function() {
    await this.chain.setLatestAnswer(BNify('44000000000')); // 440 usd
    await this.chainFoo.setLatestAnswer(BNify('100000000')); // 1 usd for 1 foo


    const res = await this.oracle.getStkAaveApr(this.aDAI.address, this.foo.address, { from: creator });
    res.should.be.bignumber.equal(BNify('5260542222222226790')); // 5.26%
  });
});
