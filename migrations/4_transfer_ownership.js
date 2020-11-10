const GovernorAlpha = artifacts.require("GovernorAlpha");
const IdleController = artifacts.require("IdleController");
const Idle = artifacts.require("Idle");
const {
  BNify, ONE, allIdleTokens, creator
} = require('./governance_params.js');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }
  await deployer.then(async () => {
    // TODO check
    const controllerImpl = await IdleController.at('0x275DA8e61ea8E02d51EDd8d0DC5c0E62b4CDB0BE');
    const controller = {address: controllerImpl.address};
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
    await logIdleState(allIdleTokens);

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
