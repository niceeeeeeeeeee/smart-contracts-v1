### Deployed smart contracts:

- PoliceChief: https://etherscan.io/address/0x669Bffac935Be666219c68D20931CBf677b8Fa1C#code
- NiceToken (NICE): https://etherscan.io/address/0x53f64be99da00fec224eaf9f8ce2012149d2fc88#code

There are only around 10 lines of codes that have been modified from SUSHI. If SUSHI didn't get hacked, we shouldn't either. That said the contracts are not officially audited so use at your own risk.

## PoliceChief

PoliceChief is a copy of SushiSwap's MasterChef https://etherscan.io/address/0xc2edad668740f1aa35e4d8f227fb8e17dca888cd with a few differences, all annoted with the comment "NICE EDIT" to make it easy to verify that it is a copy.

### Difference 1:

When the supply goes above 420, NICE burn rates are increased dramatically and emissions cut, and when supply goes below 69, emissions are increased dramatically and burn rates cut, resulting in a token that has a total supply pegged between 69 and 420.

### Difference 2:

The dev fund is set to 0.69% (nice) instead of 10%, so no rug pulls.

### Difference 3:

Migrator is removed, so LP staked in PoliceChief are 100% safe and cannot be stolen by the owner. This removes the need to use a timelock, because the only malicious thing the PoliceChief owner can do is add sketchy pools, which do not endanger your LP https://twitter.com/Quantstamp/status/1301280991021993984

### Emissions:

The initial sushi per block is set to 5000000000000000 (0.005) NICE per block, which leads to ~420 NICE very 2 weeks.

## NiceToken

NICE is a copy of SUSHI https://etherscan.io/token/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2 except for annotated code in the introduction, which implements a burn percent on each transfer. The burn percent (burnDivisor) is set periodically and automatically by the contract owner (PoliceChief contract) to make sure NICE total supply remains pegged between 69 and 420

It also fixes the governance move delegate bug https://medium.com/bulldax-finance/sushiswap-delegation-double-spending-bug-5adcc7b3830f
## How to use:

```
npm install truffle -g
npm install
truffle compile
truffle test
```