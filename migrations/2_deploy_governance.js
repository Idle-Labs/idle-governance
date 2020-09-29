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
  const creator = '0xE5Dab8208c1F4cce15883348B72086dBace3e64B';
  const dripRate = BNify('1'); // TODO

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
    {from: creator}
  );
  console.log('Governance:', gov.address);


  // TODO this should be upgradable with openzeppelin
  const controller = await deployer.deploy(IdleController,
    oracle.address,
    idle.address,
    {from: creator}
  );
  console.log('Controller:', controller.address);
  // TODO test
  // TODO add avgAPR in IdleToken contract

  // TODO this contract drips at a fixed rate! Not ok
  const reserve = await deployer.deploy(Reservoir,
    dripRate,
    idle.address,
    controller.address,
    {from: creator}
  );
  console.log('Reserve:', controller.address);

  // Transfer Timelock admin to Governor
  await gov.__queueSetTimelockPendingAdmin(gov.address, BNify('1'), {from: creator});
  await gov.__executeSetTimelockPendingAdmin(gov.address, BNify('1'), {from: creator});
  await gov.__acceptAdmin({from: creator});

  // Transfer PriceOracle ownership to Timelock
  // test this!
  await oracle.transferOwnership(timelock.address);
  // Transfer IdleController ownership to Timelock
  // test this!
  await controller.transferOwnership(timelock.address);

  // TODO send 40% to reservoir? or skip reservoir entirely?
  // and all other tokens to investors and Team and another vesting contract for ecosys fund?

  // TODO recheck all parameters from top to bottom
  // TODO check creator should have no IDLE at the end!

  // TODO upgrade IdleToken contract with IdleController and PriceOracle addresses

  // TODO initially we can still have multi-sig Guardian (ideally only a pause Guardian)
  // that can do actions in the first month or two before abdicating

  // Renounce ownership of Governor and make it decentralized
  await gov.__abdicate({from: creator});
};
