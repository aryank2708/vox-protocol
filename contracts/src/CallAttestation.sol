// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";

/// @title CallAttestation
/// @notice Proof-of-call log. Each voice call is committed onchain with hash + outcome.
contract CallAttestation {
    enum Outcome { PAID, PROMISED, NO_ANSWER, DNC }

    struct Call {
        uint256 id;
        address agent;
        bytes32 transcriptHash;
        Outcome outcome;
        uint64 timestamp;
        uint32 duration; // seconds
        address attester; // who posted it (operator / backend)
    }

    AgentRegistry public immutable registry;

    Call[] public calls;
    mapping(address => uint256[]) public callsByAgent;

    event CallAttested(
        uint256 indexed id,
        address indexed agent,
        bytes32 transcriptHash,
        Outcome outcome,
        uint32 duration,
        address attester
    );

    error AgentNotRegistered();

    constructor(address registryAddr) {
        registry = AgentRegistry(registryAddr);
    }

    function attestCall(
        address agent,
        bytes32 transcriptHash,
        Outcome outcome,
        uint32 duration
    ) external returns (uint256 id) {
        if (!registry.isRegistered(agent)) revert AgentNotRegistered();
        id = calls.length;
        calls.push(Call({
            id: id,
            agent: agent,
            transcriptHash: transcriptHash,
            outcome: outcome,
            timestamp: uint64(block.timestamp),
            duration: duration,
            attester: msg.sender
        }));
        callsByAgent[agent].push(id);
        emit CallAttested(id, agent, transcriptHash, outcome, duration, msg.sender);
    }

    function totalCalls() external view returns (uint256) {
        return calls.length;
    }

    function getCall(uint256 id) external view returns (Call memory) {
        return calls[id];
    }

    function getAgentCallCount(address agent) external view returns (uint256) {
        return callsByAgent[agent].length;
    }

    /// @notice Returns the most recent `limit` calls for an agent, newest first.
    function recentCallsForAgent(address agent, uint256 limit)
        external
        view
        returns (Call[] memory result)
    {
        uint256[] storage ids = callsByAgent[agent];
        uint256 n = ids.length;
        uint256 take = n < limit ? n : limit;
        result = new Call[](take);
        for (uint256 i = 0; i < take; i++) {
            result[i] = calls[ids[n - 1 - i]];
        }
    }

    /// @notice Newest `limit` calls across all agents.
    function recentCalls(uint256 limit) external view returns (Call[] memory result) {
        uint256 n = calls.length;
        uint256 take = n < limit ? n : limit;
        result = new Call[](take);
        for (uint256 i = 0; i < take; i++) {
            result[i] = calls[n - 1 - i];
        }
    }
}
