const PriceOracleV3 = artifacts.require("PriceOracleV3");
const BigNumber = require('bignumber.js');
const BNify = s => new BigNumber(String(s));

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network == 'coverage') {
    return;
  }

  const creator = process.env.CREATOR;
  const timelock = '0xD6dABBc2b275114a2366555d6C481EF08FDC2556';
  const oracle = await PriceOracleV3.new({from: creator, gas: BNify('2500000')}); // owner will be transferred to Timelock
  console.log('PriceOracleV3:', oracle.address);
  await oracle.transferOwnership(timelock, {from: creator});

  const tokens = {
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    comp: "0xc00e94cb662c3520282e6f5717214004a7f26888",
    wbtc: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    dai: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    susd: "0x57ab1ec28d129707052df4df418d58a2d46d5f51",
    tusd: "0x0000000000085d4780B73119b644AE5ecd22b376",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    stkAave: "0x4da27a545c0c5B758a6BA100e3a049001de870f5",
    fei: "0x956f47f50a910163d8bf957cf5846d573e7f87ca",
    rai: "0x03ab458634910aad20ef5f1c8ee96f1d6ac54919",
  }

  for (const tokenName in tokens) {
    const priceUSD = await oracle.getPriceUSD(tokens[tokenName]);
    console.log(`${tokenName} priceUSD: ${priceUSD.toString()}`);
    const priceETH = await oracle.getPriceETH(tokens[tokenName]);
    console.log(`${tokenName} priceETH: ${priceETH.toString()}`);
    console.log();
  }
};
