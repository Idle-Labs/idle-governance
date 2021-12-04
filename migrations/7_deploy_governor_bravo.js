const GovernorBravoDelegate = artifacts.require("GovernorBravoDelegate")
const GovernorBravoDelegator = artifacts.require("GovernorBravoDelegator")
const BigNumber = require('bignumber.js');

const BNify = s => new BigNumber(s);

module.exports = async function (deployer, network, accounts) {
    if (network === 'test' || network == 'coverage') {
        return;
    }

    const addresses = {
        timelock: '0xD6dABBc2b275114a2366555d6C481EF08FDC2556',
        idle: '0x875773784Af8135eA0ef43b5a374AaD105c5D39e',
        multisig: '0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b' 
    }

    const args = { // args from GovernorAlpha
        votingPeriod: '17280',
        votingDelay: '1',
        proposalThreshold: '130000000000000000000000'
    }

    const creator = accounts[0];

    await deployer.then(async () => {
        const delegate = await GovernorBravoDelegate.new({from: creator, gas: BNify('5000000')});
        
        console.log('Delegate deployed at: ' + delegate.address);

        const delegator = await GovernorBravoDelegator.new(
            addresses.timelock, 
            addresses.idle, 
            addresses.multisig, 
            delegate.address, 
            BNify(args.votingPeriod),
            BNify(args.votingDelay),
            BNify(args.proposalThreshold),
            {from: creator, gas: BNify('700000')}
        );
        
        console.log('Delegator deployed at: ' + delegator.address);
    });
}