const Timelock = artifacts.require("Timelock");
const Idle = artifacts.require("Idle");
const GovernorAlpha = artifacts.require("GovernorAlpha");
const Reservoir = artifacts.require("Reservoir");
const PriceOracle = artifacts.require("PriceOracle");
const BigNumber = require('bignumber.js');
const BNify = s => new BigNumber(String(s));

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }

  const addr0 = '0x0000000000000000000000000000000000000000';
  // hw wallet for deployments
  const creator = '0xE5Dab8208c1F4cce15883348B72086dBace3e64B';
  // Idle Labs multisig wallet, used as Pause Guardian for idleTokens and IdleController
  const idleMultisig = '';
  // Founders / team
  const founderW = '';
  const founderM = '';
  const founderS = '';
  // Investors
  const investor1 = '';
  const investor2 = '';
  const investor3 = '';

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


  const dripRatePerBlock = BNify('500000000000000000'); // TODO 0.5 COMP per block

  // full supply (13M) to creator
  const idle = await deployer.deploy(Idle, {from: creator}); // no owner
  console.log('IDLE:', idle.address);

  const oracle = await deployer.deploy(PriceOracle, {from: creator}); // owner will be transferred to Timelock
  console.log('PriceOracle:', oracle.address);

  const timelock = await deployer.deploy(Timelock,
    addr0, // admin, at the end this should be Governor
    BNify('172800'), // 2 days in sec
    {from: creator}
  );
  console.log('Timelock:', timelock.address);

  const gov = await deployer.deploy(GovernorAlpha,
    timelock.address,
    idle.address,
    creator, // guardian, at the end this should be addr0 after abdicating
    // idleMultisig ? but then 'problem' (ie multisig) for transferring the ownership,
    // guardian can cancel a queued proposal
    {from: creator}
  );
  console.log('Governance:', gov.address);

  // TODO this should be upgradable with openzeppelin
  const controller = await deployer.deploy(IdleController,
    oracle.address,
    idle.address,
    {from: creator} // owner will then be Timelock
  );
  console.log('Controller:', controller.address);
  // TODO test
  // TODO add avgAPR in IdleToken contract

  // TODO this contract drips at a fixed rate! Not ok
  const reserve = await deployer.deploy(Reservoir, // No owner
    dripRatePerBlock,
    idle.address,
    controller.address,
    {from: creator}
  );
  console.log('Reserve:', controller.address);

  // Transfer Timelock admin to Governor
  await gov.__queueSetTimelockPendingAdmin(gov.address, BNify('1'), {from: creator});
  await gov.__executeSetTimelockPendingAdmin(gov.address, BNify('1'), {from: creator});
  await gov.__acceptAdmin({from: creator});

  // Initialize idle markets in controller
  await controller._supportMarkets(allIdleTokens, {from: creator});
  await controller._addIdleMarkets(allIdleTokens, {from: creator});

  // TODO what's the rate to set? compound uses 0.176 per block
  await controller._setIdleRate(BNify('176000000000000000'));

  // Transfer PriceOracle ownership to Timelock
  await oracle.transferOwnership(timelock.address);

  // Transfer IdleController ownership to Timelock
  await controller.transferOwnership(timelock.address);

  // TODO early lp contract deployment and init

  // TODO custom vesting contracts for investors with voting and staking ability??

  // TODO send 40% to reservoir? or skip reservoir entirely?
  // and all other tokens to investors and Team and another vesting contract for ecosys fund?

  // TODO recheck all parameters from top to bottom
  // TODO check creator should have no IDLE at the end!

  // TODO upgrade IdleToken contract with IdleController and PriceOracle addresses

  // TODO initially we can still have multi-sig Guardian (ideally only a pause Guardian)
  // that can do actions in the first month or two before abdicating

  // Renounce ownership of Governor and make it decentralized
  // await gov.__abdicate({from: creator});
};
