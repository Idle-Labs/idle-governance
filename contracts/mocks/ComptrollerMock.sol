pragma solidity 0.6.12;

contract ComptrollerMock {
  uint256 public speeds;
  function setSpeeds(uint256 speed) public {
    speeds = speed;
  }
  function compSpeeds(address _cToken) external view returns (uint256) {
    return speeds;
  }
}
