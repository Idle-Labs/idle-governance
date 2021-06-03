const GovernorAlpha = artifacts.require("GovernorAlpha");
const IdleController = artifacts.require("IdleController");
const Vester = artifacts.require("Vester");
const VesterFactory = artifacts.require("VesterFactory");
const PriceOracleV2Matic = artifacts.require("PriceOracleV2Matic");
const IAaveIncentivesController = artifacts.require("IAaveIncentivesController");
const AToken = artifacts.require('AToken');
const Idle = artifacts.require("Idle");

const addresses = {
  aDAIV2:{
    'live': '0x028171bCA77440897B824Ca71D1c56caC55b68A3',
    'mumbai': '0x639cB7b21ee2161DF9c882483C9D55c90c20Ca3e',
    'polygon': '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
  },
  DAI: {
    'live': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'mumbai': '0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F',
    'polygon': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  },
};

// const forkedNetwork = "polygon";
// addresses.aDAIV2.local = addresses.aDAIV2[forkedNetwork];
// addresses.DAI.local = addresses.DAI[forkedNetwork];

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }

  const creator = process.env.CREATOR;
  const chainId = await web3.eth.getChainId();

  let oracle;
  console.log("deploying PriceOracleV2Matic");
  await deployer.deploy(PriceOracleV2Matic, {from: creator, chainId: chainId}).then(instance => oracle = instance);
  console.log("oracle deployed:", oracle.address);

  const aDAI = await AToken.at(addresses.aDAIV2[network]);
  console.log("aToken", await aDAI.name(), aDAI.address);
  const ctrlAddress = await aDAI.getIncentivesController();
  console.log("ctrlAddress", ctrlAddress);
  const ctrl = await IAaveIncentivesController.at(ctrlAddress);
  // console.log("data", await ctrl.getAssetData(addresses.aDAIV2[network]));
  console.log("data from controller", await ctrl.assets(addresses.aDAIV2[network]));

  console.log("data from oracle");
  console.log("--> ", addresses.DAI[network]);
  const x = await oracle.getStkAaveApr(addresses.aDAIV2[network], addresses.DAI[network]);
  console.log(x.toString())
};
