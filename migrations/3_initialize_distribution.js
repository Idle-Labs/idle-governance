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
    // TODO check
    const controllerImpl = await IdleController.at('0x275DA8e61ea8E02d51EDd8d0DC5c0E62b4CDB0BE');
    const timelock = await Timelock.at('0xD6dABBc2b275114a2366555d6C481EF08FDC2556')
    const controller = {address: controllerImpl.address};
    const reserve = await Reservoir.at('0x031f71B5369c251a6544c41CE059e6b3d61e42C6');
    const idle = await Idle.at('0x875773784Af8135eA0ef43b5a374AaD105c5D39e');
    const gov = await GovernorAlpha.at('0x2256b25CFC8E35c3135664FD03E77595042fe31B');

    const bigLog = (txt, val) => {
      console.log(txt, BNify(val).div(ONE).toString());
    };
    const logIdleState = async (tokens) => {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const idleDAISupplyStatePre = await controllerImpl.idleSupplyState(token);
        console.log(`${i} ######### Log Block ${idleDAISupplyStatePre.block.toString()} #############`);
        const controllerBal = await idle.balanceOf(controller.address);
        bigLog('## IDLE controller bal', controllerBal);
        const idleDaiIDLEBal = await idle.balanceOf(token);
        bigLog('## IDLE idleDAI bal', idleDaiIDLEBal);

        const daiSpeedPre = await controllerImpl.idleSpeeds(token);
        const idleAccruedDaiPre = await controllerImpl.idleAccrued(token);
        const idleSupplierIndex = await controllerImpl.idleSupplierIndex(token, token);

        // bigLog('idleDAI speed', daiSpeedPre);
        bigLog('idleDAI IDLE accrued', idleAccruedDaiPre);
        bigLog('supplyState index', idleDAISupplyStatePre.index);
        bigLog('supplier index', idleSupplierIndex);
        console.log(`${i} ######### End log #############`);
      }
    };

    if (network === 'live') {
      return console.log('check addresses');
    }

    // Initialize IDLE accrual in IdleController
    await controllerImpl._addIdleMarkets(allIdleTokens, {from: creator, gas: BNify('3700000')});
    console.log('Controller _addIdleMarkets initialized');
    await controllerImpl._setIdleRate(idleRatePerBlock, {from: creator, gas: BNify('3700000')});
    console.log('Controller _setIdleRate: Set IDLE rate per block distributed');
    await controllerImpl._setBonusDistribution(dripRateMultiplier, {from: creator});
    console.log('Controller _setBonusDistribution: Set IDLE rate per block distributed for the first month as bonus');

    // Accept IdleController admin
    const currTime = BNify((await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp);
    await timelock.queueTransaction(controller.address, BNify('0'),
      '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), currTime.plus(BNify('30')), {from: creator});
    console.log('controller queueTransaction _acceptAdmin');
    // wait(30 sec) ?
    await sleep(30000);

    await timelock.executeTransaction(controller.address, BNify('0'),
      '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), currTime.plus(BNify('30')), {from: creator});
    console.log('controller executeTransaction _acceptAdmin');

    // Set delay for proposals
    const currTime2 = BNify((await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp);
    await timelock.queueTransaction(timelock.address, BNify('0'),
      'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay.toString()]), currTime2.plus(BNify('30')), {from: creator});
    console.log('controller queueTransaction setDelay');
    // wait(30 sec) ?
    await sleep(30000);

    await timelock.executeTransaction(timelock.address, BNify('0'),
      'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay.toString()]), currTime2.plus(BNify('30')), {from: creator});
    console.log('controller executeTransaction setDelay');

    // Initialize data with first claim
    await controllerImpl.claimIdle(allIdleTokens, allIdleTokens, {from: creator, gas: BNify('900000')});
    console.log('Controller claimIdle: first claim as initialization');

    await reserve.drip({from: creator});
    console.log('dripped from reservoir');
  }).catch(err => {
    console.log(err);
    throw err;
  });
  console.log('END');
};
