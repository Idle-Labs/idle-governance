const Timelock = artifacts.require("Timelock");
const Idle = artifacts.require("Idle");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const Reservoir = artifacts.require("Reservoir");
const PriceOracle = artifacts.require("PriceOracle");
const Vester = artifacts.require("Vester");
const VesterFactory = artifacts.require("VesterFactory");
const EarlyRewards = artifacts.require("EarlyRewards");
const GovernableFund = artifacts.require("GovernableFund");
const IdleController = artifacts.require("IdleController");
const Unitroller = artifacts.require("Unitroller");
const earlyDistribution = require('../early-lp/token-distribution.js');
const {
  BNify, ONE, ONE_DAY_SEC, tokenShare,
  addr0, allIdleTokens, creator, idleMultisig, founders, investors, earlyUsers, earlyUsersAmounts,
  founderAndInvestorsShare, lpTotalShare, ecosystemFundShare, earlyRewardsShare, longTermLPRewardsShare,
  beginVesting, earlyLPDeadline, investorsCliff, foundersCliff, investorsEnd, foundersEnd, timelockDelay,
  dripRatePerBlock, idleRatePerBlock, dripRateMultiplier
} = require('./governance_params.js');
const RLP = require('rlp');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }

  const getNextAddress = (sender, nonce) => {
    return "0x" + web3.utils.sha3(RLP.encode([sender,nonce.toNumber()])).slice(12).substring(14);
  };
  const advanceTime = async (timestamp) => {
    if (network === 'live') {
      return;
    }
    return await new Promise((resolve, reject) => {
      const payload = {
        jsonrpc: "2.0",
        method: "evm_mine",
        id: +new Date
      };
      if (timestamp) {
        payload.params = [timestamp];
      }
      web3.currentProvider.send(payload, (err, res) => {
        if (err) {
          console.log('advance time err', err);
          return reject(err);
        }
        // console.log('advance time ok', res);
        return resolve({ok: true, res});
      });
    })
  };
  const advanceBlocks = async n => {
    for (var i = 0; i < n; i++) {
      await advanceTime();
    }
  };
  const sleep = async ms => {
    if (network == 'live') {
      return new Promise(resolve => setTimeout(resolve, ms));
    } else {
      const currTime = BNify((await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp);
      await advanceTime(currTime.plus(BNify(ms).div(BNify('1000'))));
    }
  };

  const nextNonce = await web3.eth.getTransactionCount(creator);
  console.log('Next nonce', nextNonce);
  await deployer.then(async () => {
    // Full supply (13M) to creator, no owner
    const idle = await Idle.new({from: creator, gas: BNify('2500000')});
    console.log('IDLE:', idle.address);

    const oracle = await PriceOracle.new({from: creator, gas: BNify('1500000')}); // owner will be transferred to Timelock
    console.log('PriceOracle:', oracle.address);

    const nextAddrGovernor = getNextAddress(creator, BNify(nextNonce).plus(BNify('3')));
    console.log('expected next addr governor', nextAddrGovernor);

    const timelock = await Timelock.new(
      creator, // admin, at the end should be Governor
      BNify('0'), // this will become timelockDelay
      nextAddrGovernor, // pendingAdmin
      {from: creator, gas: BNify('2000000')}
    );
    console.log('Timelock:', timelock.address);

    const gov = await GovernorAlpha.new(
      timelock.address,
      idle.address,
      creator, // guardian, at the end this should be addr0 after abdicating after 1 month
      // guardian can cancel a queued proposal
      {from: creator, gas: BNify('4000000')}
    );
    console.log('Governance:', gov.address);

    const controllerImplementation = await IdleController.new(
      {from: creator, gas: BNify('3000000')}
    );
    console.log('Controller implementation:', controllerImplementation.address);
    const controller = await Unitroller.new(
      controllerImplementation.address,
      {from: creator} // owner will then be Timelock
    );
    console.log('Controller:', controller.address);

    // Initialize idle markets in controller
    const controllerImpl = await IdleController.at(controller.address);
    await controllerImpl._setIdleAddress(idle.address, {from: creator});
    console.log('Controller _setIdleAddress initialized');
    await controllerImpl._setPriceOracle(oracle.address, {from: creator});
    console.log('Controller _setPriceOracle initialized');
    await controllerImpl._supportMarkets(allIdleTokens, {from: creator});
    console.log('Controller _supportMarkets initialized');

    // This contract drips at a fixed rate
    const reserve = await Reservoir.new( // No owner
      dripRatePerBlock,
      idle.address,
      controller.address,
      dripRateMultiplier,
      {from: creator}
    );
    console.log('Reserve:', reserve.address);

    const feeTreasury = await GovernableFund.new( // owner will be timelock
      {from: creator, gas: BNify('1200000')}
    );
    console.log('FeeTreasury:', feeTreasury.address);

    const longLPFund = await GovernableFund.new( // owner will be timelock
      {from: creator, gas: BNify('1200000')}
    );
    console.log('LongLPFund:', longLPFund.address);

    const ecosystem = await GovernableFund.new( // owner will be timelock
      {from: creator, gas: BNify('1200000')}
    );
    console.log('EcosystemFund:', ecosystem.address);

    // Used to distribute early LPs rewards
    const early = await EarlyRewards.new( // owner will remain creator, but has little to no power
      idle.address,
      ecosystem.address,
      earlyLPDeadline,
      {from: creator, gas: BNify('1200000')}
    );
    console.log('EarlyRewards:', early.address);

    const firstHalfAddr = earlyUsers.slice(0, parseInt(earlyUsers.length/2));
    const secondHalfAddr = earlyUsers.slice(parseInt(earlyUsers.length/2), earlyUsers.length);
    const firstHalfAmounts = earlyUsersAmounts.slice(0, parseInt(earlyUsersAmounts.length/2));
    const secondHalfAmounts = earlyUsersAmounts.slice(parseInt(earlyUsersAmounts.length/2), earlyUsersAmounts.length);

    await early.setRewards(firstHalfAddr, firstHalfAmounts, {from: creator, gas: BNify('3500000')});
    console.log('early rewards set first half');
    await early.setRewards(secondHalfAddr, secondHalfAmounts, {from: creator, gas: BNify('3500000')});
    console.log('early rewards set second half');
    await early.stopSettingRewards({from: creator});
    console.log('stop early rewards setting');

    // Factory used to deploy one Vester contract for each of the investors and team members
    const vesterFactory = await VesterFactory.new(idle.address, {from: creator, gas: BNify('2000000')});
    console.log('VesterFactory:', vesterFactory.address);

    await idle.transfer(early.address, earlyRewardsShare, {from: creator});
    console.log('Sent 2% to early lps rewards contract');
    await idle.transfer(reserve.address, lpTotalShare, {from: creator});
    console.log('Sent 38% to reservoir for LP rewards');
    await idle.transfer(ecosystem.address, ecosystemFundShare, {from: creator});
    console.log('Sent 11% to ecosys fund contract');
    await idle.transfer(vesterFactory.address, founderAndInvestorsShare, {from: creator});
    console.log('Sent 49% to Vester Factory for vesting contracts fund contract');
    await idle.transfer(longLPFund.address, longTermLPRewardsShare, {from: creator});
    console.log('Sent funds to Long term lp contract');

    await vesterFactory.deployVestingContracts(
      beginVesting,
      founders.map(f => f.address),
      investors.map(i => i.address),
      founders.map(f => f.amount),
      investors.map(i => i.amount),
      [foundersCliff, foundersEnd],
      [investorsCliff, investorsEnd],
      {from: creator, gas: BNify('3000000')} // creator have no power at the end
    );
    console.log('Vesting contracts deployed');

    const currVotesFounderInit = await idle.getCurrentVotes(founders[0].address);
    console.log('currVotesFounderInit', currVotesFounderInit.toString());

    // Creator should have no IDLE at the end
    const creatorBalance = await idle.balanceOf(creator, {from: creator});
    console.log('Creator balance', creatorBalance.toString());
    // VesterFactory should have no IDLE at the end
    const vesterFactoryBalance = await idle.balanceOf(vesterFactory.address, {from: creator});
    console.log('Vester factory balance', vesterFactoryBalance.toString());

    await oracle.transferOwnership(timelock.address, {from: creator});
    console.log('Transferred PriceOracle ownership to Timelock');
    await ecosystem.transferOwnership(timelock.address, {from: creator});
    console.log('Transferred EcosystemFund ownership to Timelock');
    await feeTreasury.transferOwnership(timelock.address, {from: creator});
    console.log('Transferred FeeTreasury ownership to Timelock');
    await longLPFund.transferOwnership(timelock.address, {from: creator});
    console.log('Transferred LongLPFund ownership to Timelock');
    await controller._setPendingAdmin(timelock.address, {from: creator});
    console.log('controller pending admin is Timelock');
  }).catch(err => {
    console.log(err);
    throw err;
  });
  console.log('END');
};
