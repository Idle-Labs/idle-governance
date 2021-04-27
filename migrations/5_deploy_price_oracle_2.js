const GovernorAlpha = artifacts.require("GovernorAlpha");
const IdleController = artifacts.require("IdleController");
const Vester = artifacts.require("Vester");
const VesterFactory = artifacts.require("VesterFactory");
const PriceOracleV2 = artifacts.require("PriceOracleV2");
const Idle = artifacts.require("Idle");
const {
  BNify, ONE, allIdleTokens, creator, founders, foundersCliff, investorsCliff, investors
} = require('./governance_params.js');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }
  const bigLog = (txt, val) => {
    console.log(txt, BNify(val).div(ONE).toString());
  };
  await deployer.then(async () => {
    const timelock = '0xD6dABBc2b275114a2366555d6C481EF08FDC2556';
    const oracle = await PriceOracleV2.new({from: creator, gas: BNify('1500000')}); // owner will be transferred to Timelock
    console.log('PriceOracleV2:', oracle.address);
    await oracle.transferOwnership(timelock, {from: creator});
  }).catch(err => {
    console.log(err);
    throw err;
  });
  console.log('END');
};
