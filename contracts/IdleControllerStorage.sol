pragma solidity 0.6.12;

contract IdleControllerStorage {
  struct Market {
    /// @notice Whether or not this market is listed
    bool isListed;
    /// @notice Whether or not this market receives IDLE
    bool isIdled;
    /// @notice Per-market mapping of "accounts in this asset"
    mapping(address => bool) accountMembership;
  }

  struct IdleMarketState {
    /// @notice The market's last updated compBorrowIndex or compSupplyIndex
    uint256 index;
    /// @notice The block number the index was last updated at
    uint256 block;
  }

  /// @notice Official mapping of idleTokens -> Market metadata
  /// @dev Used e.g. to determine if a market is supported
  mapping(address => Market) public markets;

  /// @notice A list of all markets
  IdleToken[] public allMarkets;
   /// @notice The rate at which the flywheel distributes IDLE, per block
  uint256 public idleRate;

  /// @notice The portion of compRate that each market currently receives
  mapping(address => uint256) public idleSpeeds;

  /// @notice The IDLE market supply state for each market
  mapping(address => IdleMarketState) public idleSupplyState;
  /// @notice The IDLE supply index for each market for each supplier as of the last time they accrued IDLE
  mapping(address => mapping(address => uint256)) public idleSupplierIndex;

  /// @notice The IDLE accrued but not yet transferred to each user
  mapping(address => uint256) public idleAccrued;
}
