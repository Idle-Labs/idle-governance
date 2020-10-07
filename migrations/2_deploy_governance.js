const Timelock = artifacts.require("Timelock");
const Idle = artifacts.require("Idle");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const Reservoir = artifacts.require("Reservoir");
const PriceOracle = artifacts.require("PriceOracle");
const Vester = artifacts.require("Vester");
const EarlyRewards = artifacts.require("EarlyRewards");
const EcosystemFund = artifacts.require("EcosystemFund");
const BigNumber = require('bignumber.js');
const BNify = s => new BigNumber(String(s));

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }
  const ONE = BNify('1000000000000000000');
  const tokenShare = amount => BNify(amount).times(ONE);
  const addr0 = '0x0000000000000000000000000000000000000000';
  // Addresses of idleTokens pools currently deployed that will receive IDLE from TGE
  const allIdleTokens = [
    '0x3fE7940616e5Bc47b0775a0dccf6237893353bB4', // idleDAI
    '0x5274891bEC421B39D23760c04A6755eCB444797C', // idleUSDC
    '0xF34842d05A1c888Ca02769A633DF37177415C2f8', // idleUSDT
    '0xF52CDcD458bf455aeD77751743180eC4A595Fd3F', // idleSUSD
    '0xc278041fDD8249FE4c1Aad1193876857EEa3D68c', // idleTUSD
    '0x8C81121B15197fA0eEaEE1DC75533419DcfD3151', // idleWBTC
    '0xa14eA0E11121e6E951E87c66AFe460A00BCD6A16', // idleDAI safe
    '0x3391bc034f2935ef0e1e41619445f998b2680d35', // idleUSDC safe
    '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5'  // idleUSDT safe
  ];
  // hw wallet for deployments
  const creator = '0xE5Dab8208c1F4cce15883348B72086dBace3e64B';
  // Idle Labs multisig wallet, used as Pause Guardian for idleTokens
  // and is the beneficiary of the Vester contract of the future team share
  const idleMultisig = '0xaDa343Cb6820F4f5001749892f6CAA9920129F2A';
  // Founders / team
  const founders = [
    {address: '0x3675D2A334f17bCD4689533b7Af263D48D96eC72', amount: tokenShare('')}, // founderW
    {address: '0x4F314638B730Bc46Df5e600E524267d0641C98B4', amount: tokenShare('')}, // founderM
    {address: '0xd889Acb680D5eDbFeE593d2b7355a666248bAB9b', amount: tokenShare('')}, // founderS
    {address: idleMultisig, amount: tokenShare('')}  // Future team
  ];
  // Investors
  const investors = [
    // pre-seed
    {address: '', amount: tokenShare('')},
    // seed
    {address: '', amount: tokenShare('')},
    {address: '', amount: tokenShare('')},
    {address: '', amount: tokenShare('')},
    {address: '', amount: tokenShare('')},
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

  // Full supply (13M) to creator, no owner
  const idle = await deployer.deploy(Idle, {from: creator});
  console.log('IDLE:', idle.address);

  const oracle = await deployer.deploy(PriceOracle, {from: creator}); // owner will be transferred to Timelock
  console.log('PriceOracle:', oracle.address);

  const timelock = await deployer.deploy(Timelock,
    creator, // admin, at the end should be Governor
    BNify('0'), // this will become timelockDelay
    {from: creator}
  );
  console.log('Timelock:', timelock.address);

  const gov = await deployer.deploy(GovernorAlpha,
    timelock.address,
    idle.address,
    creator, // guardian, at the end this should be addr0 after abdicating after 1 month
    // guardian can cancel a queued proposal
    {from: creator}
  );
  console.log('Governance:', gov.address);

  const controllerImplementation = await deployer.deploy(IdleController,
    oracle.address,
    idle.address,
    {from: creator} // owner will then be Timelock
  );
  const controller = await deployer.deploy(Unitroller,
    controllerImplementation.address,
    {from: creator} // owner will then be Timelock
  );
  // await controller._setPendingImplementation(controllerImplementation.address, {from: creator});
  // await controllerImplementation._become({from: creator});

  console.log('Controller:', controller.address);
  console.log('Controller implementation:', controllerImplementation.address);

  // This contract drips at a fixed rate
  // TODO update contract after some time? update contract directly
  const reserve = await deployer.deploy(Reservoir, // No owner
    dripRatePerBlock,
    idle.address,
    controller.address,
    {from: creator}
  );
  console.log('Reserve:', controller.address);

  const ecosystem = await deployer.deploy(EcosystemFund, // owner will be timelock
    {from: creator}
  );
  console.log('EcosystemFund:', ecosystem.address);

  // Used to distribute early LPs rewards
  const early = await deployer.deploy(EarlyRewards, // owner will remain creator, but has little to no power
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
  await early.stopSettingRewards({from: creator});

  // Factory used to deploy one Vester contract for each of the investors and team members
  const vesterFactory = await deployer.deploy(VesterFactory, idle.address, {from: creator});

  // Initialize idle markets in controller
  await controller._supportMarkets(allIdleTokens, {from: creator});
  await controller._addIdleMarkets(allIdleTokens, {from: creator});
  // Set IDLE rate per block distributed
  await controller._setIdleRate(idleRatePerBlock);

  // Send 2% to early lps rewards contract
  await idle.transfer(early.address, earlyRewardsShare, {from: creator});
  // Send 38% to reservoir for LP rewards
  await idle.transfer(reservoir.address, lpTotalShare, {from: creator});
  // Send 11% to ecosys fund contract
  await idle.transfer(ecosystem.address, ecosystemFundShare, {from: creator});
  // Send 49% to Vester Factory for vesting contracts fund contract
  await idle.transfer(vesterFactory.address, founderAndInvestorsShare, {from: creator});

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

  // TODO check creator should have no IDLE at the end!
  const creatorBalance = await idle.balanceOf(creator, {from: creator});
  console.log(creatorBalance.toString());
  // TODO check VesterFactory should have no IDLE at the end!
  const vesterFactoryBalance = await idle.balanceOf(vesterFactory.address, {from: creator});
  console.log(vesterFactoryBalance.toString());

  // Transfer PriceOracle ownership to Timelock
  await oracle.transferOwnership(timelock.address, {from: creator});
  // Transfer EcosystemFund ownership to Timelock
  await ecosystem.transferOwnership(timelock.address, {from: creator});
  // Transfer IdleController ownership to Timelock
  await controller._setPendingAdmin(timelock.address, {from: creator});
  await timelock.queueTransaction(controller.address, BNify('0'),
    '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), timelockEta, {from: creator});
  await timelock.executeTransaction(controller.address, BNify('0'),
    '_acceptAdmin()', web3.eth.abi.encodeParameters([], []), timelockEta, {from: creator});

  // Set delay for proposals
  await timelock.queueTransaction(controller.address, BNify('0'),
    'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay]), timelockEta, {from: creator});
  await timelock.executeTransaction(controller.address, BNify('0'),
    'setDelay(uint256)', web3.eth.abi.encodeParameters(['uint256'], [timelockDelay]), timelockEta, {from: creator});

  // Transfer Timelock admin to Governor
  await gov.__queueSetTimelockPendingAdmin(gov.address, timelockEta, {from: creator});
  await gov.__executeSetTimelockPendingAdmin(gov.address, timelockEta, {from: creator});
  await gov.__acceptAdmin({from: creator});

  // Renounce ownership of Governor and make it decentralized
  await gov.__abdicate({from: creator});
};
