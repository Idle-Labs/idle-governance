const Timelock = artifacts.require("Timelock");
const Idle = artifacts.require("Idle");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const Reservoir = artifacts.require("Reservoir");
const PriceOracle = artifacts.require("PriceOracle");
const Vester = artifacts.require("Vester");
const VesterFactory = artifacts.require("VesterFactory");
const EarlyRewards = artifacts.require("EarlyRewards");
const EcosystemFund = artifacts.require("EcosystemFund");
const IdleController = artifacts.require("IdleController");
const Unitroller = artifacts.require("Unitroller");
const BigNumber = require('bignumber.js');
const BNify = s => new BigNumber(String(s));

const RLP = require('rlp');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }
  const getNextAddress = (sender, nonce) => {
    return "0x" + web3.utils.sha3(RLP.encode([sender,nonce.toNumber()])).slice(12).substring(14);
  }
  const advanceTime = async (timestamp) => {
    if (network === 'live') {
      return;
    }
    return await new Promise((resolve, reject) => {
      const payload = {
        jsonrpc: "2.0",
        method: "evm_mine",
        id: 12345
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

  const ONE = BNify('1000000000000000000');
  const tokenShare = amount => BNify(amount).times(ONE);
  const addr0 = '0x0000000000000000000000000000000000000000';
  // Addresses of idleTokens pools currently deployed that will receive IDLE from TGE
  const allIdleTokens = [
    '0x3fE7940616e5Bc47b0775a0dccf6237893353bB4', // idleDAI
    // '0x5274891bEC421B39D23760c04A6755eCB444797C', // idleUSDC
    // '0xF34842d05A1c888Ca02769A633DF37177415C2f8', // idleUSDT
    // '0xF52CDcD458bf455aeD77751743180eC4A595Fd3F', // idleSUSD
    // '0xc278041fDD8249FE4c1Aad1193876857EEa3D68c', // idleTUSD
    // '0x8C81121B15197fA0eEaEE1DC75533419DcfD3151', // idleWBTC
    // '0xa14eA0E11121e6E951E87c66AFe460A00BCD6A16', // idleDAI safe
    // '0x3391bc034f2935ef0e1e41619445f998b2680d35', // idleUSDC safe
    // '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5'  // idleUSDT safe
  ];
  // hw wallet for deployments
  const creator = '0xE5Dab8208c1F4cce15883348B72086dBace3e64B';
  // Idle Labs multisig wallet, used as Pause Guardian for idleTokens
  // and is the beneficiary of the Vester contract of the future team share
  const idleMultisig = '0xaDa343Cb6820F4f5001749892f6CAA9920129F2A';
  // Founders / team
  const founders = [
    // TODO uncomment and check values
    {address: '0x3675D2A334f17bCD4689533b7Af263D48D96eC72', amount: tokenShare('1355380')}, // founderW
    // {address: '0x4F314638B730Bc46Df5e600E524267d0641C98B4', amount: tokenShare('')}, // founderM
    // {address: '0xd889Acb680D5eDbFeE593d2b7355a666248bAB9b', amount: tokenShare('')}, // founderS
    // {address: idleMultisig, amount: tokenShare('479700')}  // Future team
  ];
  // Investors
  const investors = [
    // TODO uncomment
    // // pre-seed
    // {address: '', amount: tokenShare('')},
    // // seed
    // {address: '', amount: tokenShare('')},
    // {address: '', amount: tokenShare('')},
    // {address: '', amount: tokenShare('')},
    // {address: '', amount: tokenShare('')},
  ];

  const founderAndInvestorsShare = tokenShare('6370000'); // 49%

  // Public program
  const lpTotalShare = tokenShare('4940000'); // 38%
  const ecosystemFundShare = tokenShare('1430000'); // 11%
  const earlyRewardsShare = tokenShare('260000'); // ~ 2%

  // Founders and investors vesting + cliff
  const beginVesting = BNify('1604246400'); // epoch in sec -> 1/11/2020 16.00 GMT
  const foundersCliff = BNify('1635782400'); // epoch in sec -> 1/11/2021 16.00 GMT
  const foundersEnd = BNify('1698854400'); // epoch in sec -> 1/11/2023 16.00 GMT
  const investorsCliff = BNify('1619884800'); // epoch in sec -> 1/5/2021 16.00 GMT
  const investorsEnd = BNify('1667318400'); // epoch in sec -> 1/11/2022 16.00 GMT
  // Deadline for claiming early lp rewards
  const earlyLPDeadline = BNify('1612195200'); // epoch in sec -> 1/2/2021 16.00 GMT

  // TODO update eta after deployment
  const timelockEta = BNify('1604246400'); // epoch in sec -> 1/11/2020 16.00 GMT;

  // Delay for executing passed proposals
  const timelockDelay = BNify('172800'); // 2 days in sec
  // TODO Reservoir drip rate, 2 IDLE per block
  const dripRatePerBlock = tokenShare('2');
  // TODO IdleController IDLE per block, 1 IDLE (currently ~6700 block per day)
  const idleRatePerBlock = tokenShare('1');

  // ############################
  const nextNonce = await web3.eth.getTransactionCount(creator);
  console.log('Next nonce', nextNonce);

  await deployer.then(async () => {
    // Full supply (13M) to creator, no owner
    const idle = await Idle.new({from: creator});
    console.log('IDLE:', idle.address);

    const oracle = await PriceOracle.new({from: creator}); // owner will be transferred to Timelock
    console.log('PriceOracle:', oracle.address);

    const nextAddrGovernor = getNextAddress(creator, BNify(nextNonce).plus(BNify('3')));
    console.log('expected next addr governor', nextAddrGovernor);

    const timelock = await Timelock.new(
      creator, // admin, at the end should be Governor
      BNify('0'), // this will become timelockDelay
      nextAddrGovernor, // pendingAdmin
      {from: creator}
    );
    console.log('Timelock:', timelock.address);

    const gov = await GovernorAlpha.new(
      timelock.address,
      idle.address,
      creator, // guardian, at the end this should be addr0 after abdicating after 1 month
      // guardian can cancel a queued proposal
      {from: creator}
    );
    console.log('Governance:', gov.address);

    const controllerImplementation = await IdleController.new(
      {from: creator} // owner will then be Timelock
    );
    console.log('Controller implementation:', controllerImplementation.address);
    const controller = await Unitroller.new(
      controllerImplementation.address,
      {from: creator} // owner will then be Timelock
    );
    // await controller._setPendingImplementation(controllerImplementation.address, {from: creator});
    // await controllerImplementation._become({from: creator});
    console.log('Controller:', controller.address);

    // Initialize idle markets in controller
    const controllerImpl = await IdleController.at(controller.address);
    await controllerImpl._setIdleAddress(idle.address, {from: creator});
    console.log('Controller _setIdleAddress initialized');
    await controllerImpl._setPriceOracle(oracle.address, {from: creator});
    console.log('Controller _setPriceOracle initialized');
    await controllerImpl._supportMarkets(allIdleTokens, {from: creator});
    console.log('Controller _supportMarkets initialized');
    await controllerImpl._addIdleMarkets(allIdleTokens, {from: creator});
    console.log('Controller _addIdleMarkets initialized');
    await controllerImpl._setIdleRate(idleRatePerBlock, {from: creator});
    console.log('Controller _setIdleRate: Set IDLE rate per block distributed');
    await controllerImpl.claimIdle(allIdleTokens, allIdleTokens, {from: creator});
    console.log('Controller claimIdle: first claim as initialization');

    // This contract drips at a fixed rate
    const reserve = await Reservoir.new( // No owner
      dripRatePerBlock,
      idle.address,
      controller.address,
      {from: creator}
    );
    console.log('Reserve:', reserve.address);

    const ecosystem = await EcosystemFund.new( // owner will be timelock
      {from: creator}
    );
    console.log('EcosystemFund:', ecosystem.address);

    // Used to distribute early LPs rewards
    const early = await EarlyRewards.new( // owner will remain creator, but has little to no power
      idle.address,
      ecosystem.address,
      earlyLPDeadline,
      {from: creator}
    );
    console.log('EarlyRewards:', early.address);

    // TODO add users and amounts
    await early.setRewards(
      // users
      [],
      // IDLE amounts
      [],
      {from: creator}
    );
    console.log('early rewards set');
    await early.stopSettingRewards({from: creator});
    console.log('stop early rewards setting');

    // Factory used to deploy one Vester contract for each of the investors and team members
    const vesterFactory = await VesterFactory.new(idle.address, {from: creator});
    console.log('VesterFactory:', vesterFactory.address);

    await idle.transfer(early.address, earlyRewardsShare, {from: creator});
    console.log('Sent 2% to early lps rewards contract');
    await idle.transfer(reserve.address, lpTotalShare, {from: creator});
    console.log('Sent 38% to reservoir for LP rewards');
    await idle.transfer(ecosystem.address, ecosystemFundShare, {from: creator});
    console.log('Sent 11% to ecosys fund contract');
    await idle.transfer(vesterFactory.address, founderAndInvestorsShare, {from: creator});
    console.log('Sent 49% to Vester Factory for vesting contracts fund contract');

    await vesterFactory.deployVestingContracts(
      beginVesting,
      founders.map(f => f.address),
      investors.map(i => i.address),
      founders.map(f => f.amount),
      investors.map(i => i.amount),
      [foundersCliff, foundersEnd],
      [investorsCliff, investorsEnd],
      {from: creator} // creator have no power at the end
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
    await controller._setPendingAdmin(timelock.address, {from: creator});
    console.log('controller pending admin is Timelock');

    await timelock.queueTransaction(controller.address, BNify('0'),
      '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), timelockEta, {from: creator});
    console.log('controller queueTransaction _acceptAdmin');

    await advanceTime(timelockEta);
    console.log('Fast forward');

    await timelock.executeTransaction(controller.address, BNify('0'),
      '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), timelockEta, {from: creator});
    console.log('controller executeTransaction _acceptAdmin');

    // TODO remove BNify('400')
    // Set delay for proposals
    await timelock.queueTransaction(timelock.address, BNify('0'),
      'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay.toString()]), timelockEta.plus(BNify('400')), {from: creator});
    console.log('controller queueTransaction setDelay');

    await advanceTime(timelockEta.plus(BNify('400')));
    console.log('Fast forward 3');

    // TODO remove BNify('400')
    await timelock.executeTransaction(timelock.address, BNify('0'),
      'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay.toString()]), timelockEta.plus(BNify('400')), {from: creator});
    console.log('controller executeTransaction setDelay');

    await gov.__acceptAdmin({from: creator});
    console.log('Ownership of Timelock transferred to Governor');
    // Renounce ownership of Governor and make it decentralized
    await gov.__abdicate({from: creator});
    console.log('Governor has now no guardian and governance is completely decentralized');
  }).catch(err => {
    console.log(err);
    throw err;
  });
  console.log('END');
};
