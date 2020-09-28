pragma solidity >=0.6.0;

interface AggregatorV3I {
  function latestAnswer() external view returns (uint256);
}
