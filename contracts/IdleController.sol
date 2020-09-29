pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IdleToken.sol";
import "./lib/Exponential.sol";

import "./PriceOracle.sol";
import "./Idle.sol";
import "./IdleControllerStorage.sol";

/**
 * @title Idle Controller Contract
 * @author Original author Idleound, modified by Idle
 */
contract IdleController is Ownable, IdleControllerStorage, Exponential {
  /// @notice Emitted when market idled status is changed
  event MarketIdled(address idleToken, bool isIdled);

  /// @notice Emitted when IDLE rate is changed
  event NewIdleRate(uint256 oldIdleRate, uint256 newIdleRate);

  /// @notice Emitted when oracle is changed
  event NewIdleOracle(address oldIdleOracle, address newIdleOracle);

  /// @notice Emitted when a new IDLE speed is calculated for a market
  event IdleSpeedUpdated(address indexed idleToken, uint256 newSpeed);

  /// @notice Emitted when IDLE is distributed to a supplier
  event DistributedIdle(address indexed idleToken, address indexed supplier, uint256 idleDelta, uint256 idleSupplyIndex);

  /// @notice The threshold above which the flywheel transfers IDLE, in wei
  uint256 public constant idleClaimThreshold = 0.001e18;

  /// @notice The initial IDLE index for a market
  uint256 public constant idleInitialIndex = 1e36;

  PriceOracle public oracle;
  address public idleAddress;

  constructor(address _oracle, address _idle) public {
    oracle = PriceOracle(_oracle);
    idleAddress = _idle;
  }

  function refreshIdleSpeeds() public {
      require(msg.sender == tx.origin, "only externally owned accounts may refresh speeds");
      refreshIdleSpeedsInternal();
  }

  function refreshIdleSpeedsInternal() internal {
      IdleToken[] memory allMarkets_ = allMarkets;

      for (uint256 i = 0; i < allMarkets_.length; i++) {
          IdleToken idleToken = allMarkets_[i];
          updateIdleSupplyIndex(address(idleToken));
      }

      Exp memory totalUtility = Exp({mantissa: 0});
      Exp[] memory utilities = new Exp[](allMarkets_.length);
      for (uint256 i = 0; i < allMarkets_.length; i++) {
          IdleToken idleToken = allMarkets_[i];
          if (markets[address(idleToken)].isIdled) {
              // TODO test this
              uint256 tokenDecimals = ERC20(idleToken.token()).decimals();
              Exp memory tokenPriceNorm = mul_(Exp({mantissa: idleToken.tokenPrice()}), 10**(18-tokenDecimals)); // norm to 1e18 always
              Exp memory tokenSupply = Exp({mantissa: idleToken.totalSupply()}); // 1e18 always
              Exp memory tvl = mul_(tokenPriceNorm, tokenSupply); // 1e18
              Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(address(idleToken))}); // Must return a normalized price to 1e18
              Exp memory tvlUnderlying = mul_(tvl, assetPrice); // 1e18
              Exp memory utility = mul_(tvlUnderlying, Exp({mantissa: idleToken.getAvgAPR()})); // avgAPR 1e18 always

              utilities[i] = utility;
              totalUtility = add_(totalUtility, utility);
          }
      }

      for (uint256 i = 0; i < allMarkets_.length; i++) {
          IdleToken idleToken = allMarkets[i];
          uint256 newSpeed = totalUtility.mantissa > 0 ? mul_(idleRate, div_(utilities[i], totalUtility)) : 0;
          idleSpeeds[address(idleToken)] = newSpeed;
          emit IdleSpeedUpdated(address(idleToken), newSpeed);
      }
  }

  /**
   * @notice Accrue IDLE to the market by updating the supply index
   * @param idleToken The market whose supply index to update
   */
  function updateIdleSupplyIndex(address idleToken) internal {
      IdleMarketState storage supplyState = idleSupplyState[idleToken];
      uint256 supplySpeed = idleSpeeds[idleToken];
      uint256 blockNumber = block.number;
      uint256 deltaBlocks = sub_(blockNumber, supplyState.block);
      if (deltaBlocks > 0 && supplySpeed > 0) {
          uint256 supplyTokens = IdleToken(idleToken).totalSupply();
          uint256 idleAccrued = mul_(deltaBlocks, supplySpeed);
          Double memory ratio = supplyTokens > 0 ? fraction(idleAccrued, supplyTokens) : Double({mantissa: 0});
          Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
          idleSupplyState[idleToken] = IdleMarketState({
              index: index.mantissa,
              block: blockNumber
          });
      } else if (deltaBlocks > 0) {
          supplyState.block = blockNumber;
      }
  }

  /**
   * @notice Calculate IDLE accrued by a supplier and possibly transfer it to them
   * @param idleToken The market in which the supplier is interacting
   * @param supplier The address of the supplier to distribute IDLE to
   */
  function distributeIdle(address idleToken, address supplier, bool distributeAll) internal {
      IdleMarketState storage supplyState = idleSupplyState[idleToken];
      Double memory supplyIndex = Double({mantissa: supplyState.index});
      Double memory supplierIndex = Double({mantissa: idleSupplierIndex[idleToken][supplier]});
      idleSupplierIndex[idleToken][supplier] = supplyIndex.mantissa;

      if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
          supplierIndex.mantissa = idleInitialIndex;
      }

      Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
      uint256 supplierTokens = IdleToken(idleToken).balanceOf(supplier);
      uint256 supplierDelta = mul_(supplierTokens, deltaIndex);
      uint256 supplierAccrued = add_(idleAccrued[supplier], supplierDelta);
      idleAccrued[supplier] = transferIdle(supplier, supplierAccrued, distributeAll ? 0 : idleClaimThreshold);
      emit DistributedIdle(idleToken, supplier, supplierDelta, supplyIndex.mantissa);
  }

  /**
   * @notice Transfer IDLE to the user, if they are above the threshold
   * @dev Note: If there is not enough IDLE, we do not perform the transfer all.
   * @param user The address of the user to transfer IDLE to
   * @param userAccrued The amount of IDLE to (possibly) transfer
   * @return The amount of IDLE which was NOT transferred to the user
   */
  function transferIdle(address user, uint256 userAccrued, uint256 threshold) internal returns (uint256) {
      if (userAccrued >= threshold && userAccrued > 0) {
          Idle idle = Idle(idleAddress);
          uint256 idleRemaining = idle.balanceOf(address(this));
          if (userAccrued <= idleRemaining) {
              idle.transfer(user, userAccrued);
              return 0;
          }
      }
      return userAccrued;
  }

  /**
   * @notice Claim all the idle accrued by holder in all markets
   * @param holder The address to claim IDLE for
   */
  function claimIdle(address holder) public {
      address[] memory holders = new address[](1);
      holders[0] = holder;
      return claimIdle(holders, allMarkets);
  }

  /**
   * @notice Claim all idle accrued by the holders
   * @param holders The addresses to claim IDLE for
   * @param idleTokens The list of markets to claim IDLE in
   */
  function claimIdle(address[] memory holders, IdleToken[] memory idleTokens) public {
      for (uint256 i = 0; i < idleTokens.length; i++) {
          IdleToken idleToken = idleTokens[i];
          require(markets[address(idleToken)].isListed, "market must be listed");
          updateIdleSupplyIndex(address(idleToken));
          for (uint256 j = 0; j < holders.length; j++) {
              distributeIdle(address(idleToken), holders[j], true);
          }
      }
  }

  /*** Idle Distribution Admin ***/
  /**
   * @notice Set the amount of IDLE distributed per block
   * @param idleRate_ The amount of IDLE wei per block to distribute
   */
  function _setIdleRate(uint256 idleRate_) external onlyOwner {
      uint256 oldRate = idleRate;
      idleRate = idleRate_;
      emit NewIdleRate(oldRate, idleRate_);

      refreshIdleSpeedsInternal();
  }

  function _setPriceOracle(address priceOracle_) external onlyOwner {
      address oldOracle = address(oracle);
      oracle = PriceOracle(priceOracle_);
      emit NewIdleOracle(oldOracle, priceOracle_);

      refreshIdleSpeedsInternal();
  }

  /**
   * @notice Add markets to idleMarkets, allowing them to earn IDLE in the flywheel
   * @param idleTokens The addresses of the markets to add
   */
  function _addIdleMarkets(address[] memory idleTokens) external onlyOwner {
      for (uint256 i = 0; i < idleTokens.length; i++) {
          _addIdleMarketInternal(idleTokens[i]);
      }

      refreshIdleSpeedsInternal();
  }

  function _addIdleMarketInternal(address idleToken) internal {
      Market storage market = markets[idleToken];
      require(market.isListed == true, "idle market is not listed");
      require(market.isIdled == false, "idle market already added");

      market.isIdled = true;
      emit MarketIdled(idleToken, true);

      if (idleSupplyState[idleToken].index == 0 && idleSupplyState[idleToken].block == 0) {
          idleSupplyState[idleToken] = IdleMarketState({
              index: idleInitialIndex,
              block: block.number
          });
      }
  }

  /**
   * @notice Remove a market from idleMarkets, preventing it from earning IDLE in the flywheel
   * @param idleToken The address of the market to drop
   */
  function _dropIdleMarket(address idleToken) public onlyOwner {
      Market storage market = markets[idleToken];
      require(market.isIdled == true, "market is not a idle market");

      market.isIdled = false;
      emit MarketIdled(idleToken, false);

      refreshIdleSpeedsInternal();
  }

  /**
   * @notice Return all of the markets
   * @dev The automatic getter may be used to access an individual market.
   * @return The list of market addresses
   */
  function getAllMarkets() public view returns (IdleToken[] memory) {
      return allMarkets;
  }
}
