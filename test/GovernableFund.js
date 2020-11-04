const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const GovernableFund = artifacts.require('GovernableFund');
const TokenMock = artifacts.require('TokenMock');

const BNify = n => new BN(String(n));

contract('GovernableFund', function ([_, creator, nonOwner, someone, foo, manager, feeReceiver]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // mainnet
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';
    this.fooAddr = '0x0000000000000000000000000000000000000003';

    this.idle = await TokenMock.new({from: creator});
    this.fakeToken = await TokenMock.new({from: creator});
    this.fund = await GovernableFund.new({from: creator});
  });

  it('allows onlyOwner to transfer a token', async function () {
    const val = BNify('20').mul(this.one);
    await this.fakeToken.transfer(this.fund.address, val, {from: creator});

    await this.fund.transfer(this.fakeToken.address, someone, val.div(BNify('2')), {from: creator});
    (await this.fakeToken.balanceOf(someone)).should.be.bignumber.equal(val.div(BNify('2')));

    await expectRevert.unspecified(this.fund.transfer(this.fakeToken.address, someone, val.div(BNify('20')), { from: nonOwner }));
  });
  it('allows onlyOwner to transfer ETH', async function () {
    const res = await web3.eth.getBalance(someone);
    await web3.eth.sendTransaction({from: creator, to: this.fund.address, value: BNify('20').mul(this.one)});

    await this.fund.transferETH(someone, this.one, {from: creator});
    const newBal = await web3.eth.getBalance(someone);
    newBal.should.be.bignumber.equal(BNify(res).add(this.one));
    await expectRevert.unspecified(this.fund.transferETH(someone, this.one, { from: nonOwner }));
  });
});
