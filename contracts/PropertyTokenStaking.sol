// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {PropertyToken} from "./PropertyToken.sol";

/// @title PropertyTokenStaking
/// @notice Dedicated ERC-1155 staking contract for TokenEstate fractional property units.
/// @dev Implements custodial staking using OpenZeppelin ERC1155Holder.
///      Rewards are strictly funded in native MST; there are no inflationary mints or guaranteed yields.
///      Transfers conform strictly to PropertyToken compliance and whitelisting requirements.
contract PropertyTokenStaking is ERC1155Holder, ReentrancyGuard, Pausable, AccessControl {
    bytes32 public constant REWARD_DISTRIBUTOR_ROLE = keccak256("REWARD_DISTRIBUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    PropertyToken public immutable propertyToken;

    struct PoolConfig {
        uint64 minLockDuration;
        uint64 maxLockDuration;
        bool isEnabled;
    }

    struct PoolState {
        uint256 totalStaked;
        uint256 totalRewardsFunded;
        uint256 totalRewardsClaimed;
        uint256 accumulatedRewardPerToken; // Scaled by 1e18
        uint256 pendingRewardBuffer;      // Rewards funded before any units are staked
    }

    struct StakeRecord {
        uint256 amount;
        uint64 lockStartTime;
        uint64 lockEndTime;
        uint256 rewardDebt;
        uint256 pendingRewards;
    }

    // tokenId => PoolConfig
    mapping(uint256 => PoolConfig) public poolConfigs;
    // tokenId => PoolState
    mapping(uint256 => PoolState) public poolStates;
    // tokenId => investor => StakeRecord
    mapping(uint256 => mapping(address => StakeRecord)) public stakes;

    // Events
    event Staked(uint256 indexed tokenId, address indexed investor, uint256 amount, uint64 lockEndTime);
    event Unstaked(uint256 indexed tokenId, address indexed investor, uint256 amount);
    event RewardsFunded(uint256 indexed tokenId, address indexed funder, uint256 amount, uint256 newAccumulatedPerToken);
    event RewardsClaimed(uint256 indexed tokenId, address indexed investor, uint256 amount);
    event EmergencyWithdrawn(uint256 indexed tokenId, address indexed investor, uint256 amount);
    event PoolConfigured(uint256 indexed tokenId, uint64 minLockDuration, uint64 maxLockDuration, bool isEnabled);

    // Custom errors
    error InvalidAddress(address addr);
    error ZeroAmount();
    error StakingDisabled(uint256 tokenId);
    error IneligibleInvestor(address investor);
    error StakingContractNotAuthorized();
    error TransfersDisabledForToken(uint256 tokenId);
    error InvalidLockDuration(uint64 duration, uint64 minDuration, uint64 maxDuration);
    error LockPeriodActive(uint64 lockEndTime, uint64 currentTimestamp);
    error InsufficientStakedBalance(uint256 available, uint256 requested);
    error NoPendingRewards();
    error RewardTransferFailed();
    error ContractPaused();
    error DirectDepositNotAllowed();

    constructor(address propertyTokenAddress, address admin) {
        if (propertyTokenAddress == address(0)) revert InvalidAddress(propertyTokenAddress);
        if (admin == address(0)) revert InvalidAddress(admin);

        propertyToken = PropertyToken(propertyTokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARD_DISTRIBUTOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------- Pool Configuration ----------

    /// @notice Configure staking parameters for a specific PropertyToken tokenId
    /// @param tokenId The ERC-1155 token ID of the property
    /// @param minLockDuration Minimum lock duration in seconds
    /// @param maxLockDuration Maximum lock duration in seconds
    /// @param enabled Whether staking is active for this property
    function configurePool(
        uint256 tokenId,
        uint64 minLockDuration,
        uint64 maxLockDuration,
        bool enabled
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minLockDuration > maxLockDuration) {
            revert InvalidLockDuration(minLockDuration, minLockDuration, maxLockDuration);
        }
        poolConfigs[tokenId] = PoolConfig({
            minLockDuration: minLockDuration,
            maxLockDuration: maxLockDuration,
            isEnabled: enabled
        });
        emit PoolConfigured(tokenId, minLockDuration, maxLockDuration, enabled);
    }

    // ---------- Staking Operations ----------

    /// @notice Stakes ERC-1155 property units into custody with a configurable lock duration
    /// @param tokenId The property token ID
    /// @param amount Number of units to stake
    /// @param lockDuration Desired lock duration in seconds (must be within pool min/max)
    function stake(
        uint256 tokenId,
        uint256 amount,
        uint64 lockDuration
    ) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        PoolConfig storage config = poolConfigs[tokenId];
        // If unconfigured, default to enabled with max 365-day lock
        if (!config.isEnabled && (config.minLockDuration != 0 || config.maxLockDuration != 0)) {
            revert StakingDisabled(tokenId);
        }
        uint64 maxLock = config.maxLockDuration == 0 ? 365 days : config.maxLockDuration;
        if (lockDuration < config.minLockDuration || lockDuration > maxLock) {
            revert InvalidLockDuration(lockDuration, config.minLockDuration, maxLock);
        }

        // Compliance pre-flight checks:
        // Investor must be whitelisted, staking contract must be whitelisted.
        // Transfers are allowed if general secondary transfers are enabled OR staking contract has specific exemption.
        if (!propertyToken.isEligibleInvestor(msg.sender)) revert IneligibleInvestor(msg.sender);
        if (!propertyToken.isEligibleInvestor(address(this))) revert StakingContractNotAuthorized();
        PropertyToken.Property memory prop = propertyToken.getProperty(tokenId);
        if (!prop.transfersEnabled && !propertyToken.isAuthorizedStakingContract(address(this))) {
            revert TransfersDisabledForToken(tokenId);
        }

        PoolState storage state = poolStates[tokenId];
        StakeRecord storage record = stakes[tokenId][msg.sender];

        // If rewards were funded before any units were staked, credit the buffer to the first staker
        if (state.totalStaked == 0 && state.pendingRewardBuffer > 0) {
            record.pendingRewards += state.pendingRewardBuffer;
            state.pendingRewardBuffer = 0;
        }

        // Update reward accounting for existing stake
        if (record.amount > 0) {
            uint256 pending = ((record.amount * state.accumulatedRewardPerToken) / 1e18) - record.rewardDebt;
            record.pendingRewards += pending;
        }

        record.amount += amount;
        state.totalStaked += amount;

        // Set lock timestamps (extends lock end time if user chooses a longer period)
        uint64 newLockEnd = uint64(block.timestamp + lockDuration);
        if (newLockEnd > record.lockEndTime) {
            record.lockEndTime = newLockEnd;
        }
        record.lockStartTime = uint64(block.timestamp);

        // Update reward debt
        record.rewardDebt = (record.amount * state.accumulatedRewardPerToken) / 1e18;

        // Transfer tokens into contract custody
        propertyToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        emit Staked(tokenId, msg.sender, amount, record.lockEndTime);
    }

    /// @notice Unstakes ERC-1155 property units from custody after the lock period has expired
    /// @param tokenId The property token ID
    /// @param amount Number of units to unstake
    function unstake(uint256 tokenId, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();

        StakeRecord storage record = stakes[tokenId][msg.sender];
        if (record.amount < amount) revert InsufficientStakedBalance(record.amount, amount);
        if (block.timestamp < record.lockEndTime) {
            revert LockPeriodActive(record.lockEndTime, uint64(block.timestamp));
        }

        // Compliance pre-flight checks:
        if (!propertyToken.isEligibleInvestor(msg.sender)) revert IneligibleInvestor(msg.sender);
        if (!propertyToken.isEligibleInvestor(address(this))) revert StakingContractNotAuthorized();
        PropertyToken.Property memory prop = propertyToken.getProperty(tokenId);
        if (!prop.transfersEnabled && !propertyToken.isAuthorizedStakingContract(address(this))) {
            revert TransfersDisabledForToken(tokenId);
        }

        PoolState storage state = poolStates[tokenId];

        // Update reward accounting
        uint256 pending = ((record.amount * state.accumulatedRewardPerToken) / 1e18) - record.rewardDebt;
        record.pendingRewards += pending;

        record.amount -= amount;
        state.totalStaked -= amount;

        record.rewardDebt = (record.amount * state.accumulatedRewardPerToken) / 1e18;

        // Return tokens to investor
        propertyToken.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");

        emit Unstaked(tokenId, msg.sender, amount);
    }

    // ---------- Reward Accounting & Distribution ----------

    /// @notice Fund rewards in native MST for a specific property token ID
    /// @param tokenId The property token ID to reward
    function fundRewards(uint256 tokenId) external payable onlyRole(REWARD_DISTRIBUTOR_ROLE) whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        PoolState storage state = poolStates[tokenId];
        state.totalRewardsFunded += msg.value;

        if (state.totalStaked > 0) {
            state.accumulatedRewardPerToken += (msg.value * 1e18) / state.totalStaked;
        } else {
            // Buffer until stakers deposit
            state.pendingRewardBuffer += msg.value;
        }

        emit RewardsFunded(tokenId, msg.sender, msg.value, state.accumulatedRewardPerToken);
    }

    /// @notice Claim accrued native MST rewards for a specific property token ID
    /// @param tokenId The property token ID
    /// @return rewardAmount The amount of native MST claimed and transferred
    function claimRewards(uint256 tokenId) external whenNotPaused nonReentrant returns (uint256 rewardAmount) {
        StakeRecord storage record = stakes[tokenId][msg.sender];
        PoolState storage state = poolStates[tokenId];

        uint256 newlyAccrued = 0;
        if (record.amount > 0) {
            newlyAccrued = ((record.amount * state.accumulatedRewardPerToken) / 1e18) - record.rewardDebt;
        }

        rewardAmount = record.pendingRewards + newlyAccrued;
        if (rewardAmount == 0) revert NoPendingRewards();

        record.pendingRewards = 0;
        record.rewardDebt = (record.amount * state.accumulatedRewardPerToken) / 1e18;
        state.totalRewardsClaimed += rewardAmount;

        (bool success, ) = msg.sender.call{value: rewardAmount}("");
        if (!success) revert RewardTransferFailed();

        emit RewardsClaimed(tokenId, msg.sender, rewardAmount);
    }

    // ---------- Emergency Protections ----------

    /// @notice Safe emergency exit: allows an investor to withdraw 100% of their staked units
    ///         immediately even when paused or locked, forfeiting unclaimed rewards.
    /// @param tokenId The property token ID
    function emergencyWithdraw(uint256 tokenId) external nonReentrant {
        StakeRecord storage record = stakes[tokenId][msg.sender];
        uint256 amount = record.amount;
        if (amount == 0) revert ZeroAmount();

        // Compliance checks for transfer safety
        if (!propertyToken.isEligibleInvestor(msg.sender)) revert IneligibleInvestor(msg.sender);
        if (!propertyToken.isEligibleInvestor(address(this))) revert StakingContractNotAuthorized();
        PropertyToken.Property memory prop = propertyToken.getProperty(tokenId);
        if (!prop.transfersEnabled && !propertyToken.isAuthorizedStakingContract(address(this))) {
            revert TransfersDisabledForToken(tokenId);
        }

        PoolState storage state = poolStates[tokenId];

        state.totalStaked -= amount;
        record.amount = 0;
        record.pendingRewards = 0;
        record.rewardDebt = 0;
        record.lockEndTime = 0;

        propertyToken.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");

        emit EmergencyWithdrawn(tokenId, msg.sender, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------- View Functions ----------

    /// @notice Calculate pending rewards for an investor on a token ID
    function getPendingRewards(uint256 tokenId, address investor) external view returns (uint256) {
        StakeRecord storage record = stakes[tokenId][investor];
        PoolState storage state = poolStates[tokenId];

        uint256 newlyAccrued = 0;
        if (record.amount > 0) {
            newlyAccrued = ((record.amount * state.accumulatedRewardPerToken) / 1e18) - record.rewardDebt;
        }
        return record.pendingRewards + newlyAccrued;
    }

    /// @notice Get staking status and lock details for an investor
    function getStakeInfo(uint256 tokenId, address investor)
        external
        view
        returns (
            uint256 amount,
            uint64 lockStartTime,
            uint64 lockEndTime,
            uint256 pendingRewards,
            bool isLocked
        )
    {
        StakeRecord storage record = stakes[tokenId][investor];
        PoolState storage state = poolStates[tokenId];

        uint256 newlyAccrued = 0;
        if (record.amount > 0) {
            newlyAccrued = ((record.amount * state.accumulatedRewardPerToken) / 1e18) - record.rewardDebt;
        }

        amount = record.amount;
        lockStartTime = record.lockStartTime;
        lockEndTime = record.lockEndTime;
        pendingRewards = record.pendingRewards + newlyAccrued;
        isLocked = block.timestamp < record.lockEndTime;
    }

    /// @notice Get general pool statistics and configuration
    function getPoolInfo(uint256 tokenId)
        external
        view
        returns (
            uint256 totalStaked,
            uint256 totalRewardsFunded,
            uint256 totalRewardsClaimed,
            uint64 minLockDuration,
            uint64 maxLockDuration,
            bool isEnabled,
            uint256 currentRewardBalance
        )
    {
        PoolConfig storage config = poolConfigs[tokenId];
        PoolState storage state = poolStates[tokenId];

        totalStaked = state.totalStaked;
        totalRewardsFunded = state.totalRewardsFunded;
        totalRewardsClaimed = state.totalRewardsClaimed;
        minLockDuration = config.minLockDuration;
        maxLockDuration = config.maxLockDuration == 0 ? 365 days : config.maxLockDuration;
        isEnabled = config.isEnabled || (config.minLockDuration == 0 && config.maxLockDuration == 0);
        currentRewardBalance = state.totalRewardsFunded > state.totalRewardsClaimed
            ? state.totalRewardsFunded - state.totalRewardsClaimed
            : 0;
    }

    // ---------- ERC1155 Acceptance Guards ----------

    /// @dev Prevents accidental direct transfers into contract custody. Only stake() can transfer tokens in.
    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        if (operator != address(this)) {
            revert DirectDepositNotAllowed();
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        if (operator != address(this)) {
            revert DirectDepositNotAllowed();
        }
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155Holder, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
