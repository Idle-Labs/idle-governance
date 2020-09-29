pragma solidity 0.6.12;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IdleTokenMock is ERC20 {
  address public tokenAddr;

  constructor()
    ERC20('IDLEDAI', 'IDLEDAI') public {
  }

  function token() external view returns (address) {
    return tokenAddr;
  }
  function setToken(address _token) public {
    tokenAddr = _token;
  }
}
