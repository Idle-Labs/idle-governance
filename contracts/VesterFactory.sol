pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./Vester.sol";

contract VesterFactory is Ownable {
    using SafeMath for uint256;

    address public IDLE;
    mapping (address => address) public vestingContracts;

    constructor(address idle) public {
      require(idle != address(0), "IS_0");
      IDLE = idle;
    }

    function deployVestingContracts(
      uint256 vestingStart,
      address[] memory founders,
      address[] memory investors,
      uint256[] memory founderAmounts,
      uint256[] memory investorAmounts,
      uint256[] memory foundersVestingParams,
      uint256[] memory investorsVestingParams
    ) public onlyOwner {
      require(foundersVestingParams.length == founders.length && founders.length == founderAmounts.length, "FOUNDERS_LEN");
      require(investorsVestingParams.length == investors.length && investors.length == investorAmounts.length, "INVESTORS_LEN");
      for (uint256 i = 0; i < founders.length; i++) {
        _deployVesting(founders[i], founderAmounts[i], foundersVestingParams[0], foundersVestingParams[1], foundersVestingParams[2]);
      }
      for (uint256 j = 0; j < investors.length; j++) {
        _deployVesting(investors[j], investorAmounts[j], investorsVestingParams[0], investorsVestingParams[1], investorsVestingParams[2]);
      }
    }

    function _deployVesting(
      address recepient, uint256 amount,
      uint256 beginVesting, uint256 cliff, uint256 endVesting
    ) internal returns (address vester)  {
      require(recepient != address(0), 'IS_0');
      require(amount != 0, 'IS_0');

      uint256 timestamp = block.timestamp;
      require(cliff >= timestamp, 'TIMESTAMP');
      require(endVesting >= timestamp, 'TIMESTAMP');

      vester = address(new Vester(IDLE, recepient, amount, beginVesting, cliff, endVesting));
      vestingContracts[recepient] = vester;
      // Idle tokens should already be in this contract
      IERC20(IDLE).transfer(vester, amount);
    }

    function emergencyWithdrawal(address token, address to, uint256 amount) external onlyOwner {
      ERC20(token).transfer(to, amount);
    }
}
