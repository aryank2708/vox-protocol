// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";
import {CallAttestation} from "./CallAttestation.sol";

/// @title ReputationEscrow
/// @notice Merchants deposit MON; per attested outcome the contract releases payout
///         to the agent operator and updates the agent reputation score.
contract ReputationEscrow {
    AgentRegistry public immutable registry;
    CallAttestation public immutable attestations;

    // payout per outcome, in wei (MON has 18 decimals on Monad)
    mapping(uint8 => uint256) public payoutByOutcome;

    // merchant -> deposited balance available for releases
    mapping(address => uint256) public merchantBalance;

    // agent -> reputation score (weighted by outcome)
    mapping(address => int256) public reputation;
    mapping(address => uint256) public totalReleased;

    // per-call release accounting
    mapping(uint256 => bool) public callReleased;
    mapping(uint256 => address) public callMerchant;

    struct Release {
        uint256 callId;
        address agent;
        address operator;
        address merchant;
        uint256 amount;
        uint8 outcome;
        uint64 timestamp;
    }

    Release[] public releases;
    address public immutable admin;

    event Deposited(address indexed merchant, uint256 amount);
    event PayoutConfigured(uint8 outcome, uint256 amount);
    event CallReleased(
        uint256 indexed callId,
        address indexed agent,
        address indexed merchant,
        address operator,
        uint256 amount,
        uint8 outcome,
        int256 newReputation
    );
    event MerchantWithdraw(address indexed merchant, uint256 amount);

    error NotAdmin();
    error InsufficientBalance();
    error AlreadyReleased();
    error UnknownCall();
    error CallAgentMismatch();

    constructor(address registryAddr, address attestationsAddr) {
        registry = AgentRegistry(registryAddr);
        attestations = CallAttestation(attestationsAddr);
        admin = msg.sender;

        // default payouts (in wei, MON 18 decimals)
        payoutByOutcome[uint8(CallAttestation.Outcome.PAID)]      = 0.05 ether;
        payoutByOutcome[uint8(CallAttestation.Outcome.PROMISED)]  = 0.02 ether;
        payoutByOutcome[uint8(CallAttestation.Outcome.NO_ANSWER)] = 0.005 ether;
        payoutByOutcome[uint8(CallAttestation.Outcome.DNC)]       = 0;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function setPayout(uint8 outcome, uint256 amount) external onlyAdmin {
        payoutByOutcome[outcome] = amount;
        emit PayoutConfigured(outcome, amount);
    }

    /// @notice Merchant deposits MON to fund future releases.
    function deposit() external payable {
        merchantBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Merchant withdraws unused balance.
    function withdraw(uint256 amount) external {
        if (merchantBalance[msg.sender] < amount) revert InsufficientBalance();
        merchantBalance[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit MerchantWithdraw(msg.sender, amount);
    }

    /// @notice Release payout for a single attested call. Anyone can trigger; funds come
    ///         from `merchant`'s deposited balance and go to the agent's operator wallet.
    function releaseForCall(uint256 callId, address merchant) external {
        if (callReleased[callId]) revert AlreadyReleased();
        if (callId >= attestations.totalCalls()) revert UnknownCall();

        CallAttestation.Call memory c = attestations.getCall(callId);
        AgentRegistry.Agent memory a = registry.getAgent(c.agent);

        uint256 amount = payoutByOutcome[uint8(c.outcome)];
        if (merchantBalance[merchant] < amount) revert InsufficientBalance();

        callReleased[callId] = true;
        callMerchant[callId] = merchant;
        merchantBalance[merchant] -= amount;
        totalReleased[c.agent] += amount;

        int256 delta = _reputationDelta(c.outcome);
        reputation[c.agent] += delta;

        releases.push(Release({
            callId: callId,
            agent: c.agent,
            operator: a.operator,
            merchant: merchant,
            amount: amount,
            outcome: uint8(c.outcome),
            timestamp: uint64(block.timestamp)
        }));

        if (amount > 0) {
            (bool ok, ) = a.operator.call{value: amount}("");
            require(ok, "payout failed");
        }

        emit CallReleased(callId, c.agent, merchant, a.operator, amount, uint8(c.outcome), reputation[c.agent]);
    }

    function _reputationDelta(CallAttestation.Outcome o) internal pure returns (int256) {
        if (o == CallAttestation.Outcome.PAID)      return 10;
        if (o == CallAttestation.Outcome.PROMISED)  return 4;
        if (o == CallAttestation.Outcome.NO_ANSWER) return -1;
        return -5; // DNC
    }

    function totalReleases() external view returns (uint256) {
        return releases.length;
    }

    /// @notice Newest `limit` releases, newest first.
    function recentReleases(uint256 limit) external view returns (Release[] memory result) {
        uint256 n = releases.length;
        uint256 take = n < limit ? n : limit;
        result = new Release[](take);
        for (uint256 i = 0; i < take; i++) {
            result[i] = releases[n - 1 - i];
        }
    }

    receive() external payable {
        merchantBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
