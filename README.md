# Idle governance contracts
Live version: [https://idle.finance](https://idle.finance)

### Introduction
Idle is a decentralized protocol dedicated to bringing automatic asset allocation and aggregation to the interest-bearing tokens economy. This protocol bundles stable crypto-assets (stablecoins) into tokenized baskets that are programmed to automatically rebalance based on different management logics.

### Docs
[developers.idle.finance](http://developers.idle.finance/)

### Tests
To run tests first spin up a ganache-cli instance with unlimited contract size flag
```
ganache-cli --allowUnlimitedContractSize
```

then

```
truffle test
```

### Migrations with mainnet fork
To run migrations in mainnet first spin up a ganache-cli instance with fork flag
using the script below (remember to update your infura key inside)

```
./start-fork-public.sh
```

then

```
truffle migrate --f 2 --to 2 --network local
```
