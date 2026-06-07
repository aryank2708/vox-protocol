// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry
/// @notice Onchain identity registry for voice AI agents.
contract AgentRegistry {
    enum AgentType { COLLECTIONS, ONBOARDING, REMINDER, SUPPORT, OTHER }

    struct Agent {
        address wallet;
        string name;
        AgentType agentType;
        string authorizedActions; // CSV / JSON blob of allowed actions
        address operator;          // entity who registered + controls the agent
        uint64 registeredAt;
        bool active;
    }

    mapping(address => Agent) public agents;
    address[] public agentList;

    event AgentRegistered(
        address indexed wallet,
        address indexed operator,
        string name,
        AgentType agentType,
        string authorizedActions
    );
    event AgentUpdated(address indexed wallet, string authorizedActions, bool active);

    error AlreadyRegistered();
    error NotRegistered();
    error NotOperator();

    function registerAgent(
        address wallet,
        string calldata name,
        AgentType agentType,
        string calldata authorizedActions
    ) external {
        if (agents[wallet].wallet != address(0)) revert AlreadyRegistered();
        agents[wallet] = Agent({
            wallet: wallet,
            name: name,
            agentType: agentType,
            authorizedActions: authorizedActions,
            operator: msg.sender,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        agentList.push(wallet);
        emit AgentRegistered(wallet, msg.sender, name, agentType, authorizedActions);
    }

    function updateAgent(address wallet, string calldata authorizedActions, bool active) external {
        Agent storage a = agents[wallet];
        if (a.wallet == address(0)) revert NotRegistered();
        if (a.operator != msg.sender) revert NotOperator();
        a.authorizedActions = authorizedActions;
        a.active = active;
        emit AgentUpdated(wallet, authorizedActions, active);
    }

    function isRegistered(address wallet) external view returns (bool) {
        return agents[wallet].wallet != address(0);
    }

    function totalAgents() external view returns (uint256) {
        return agentList.length;
    }

    function getAgent(address wallet) external view returns (Agent memory) {
        return agents[wallet];
    }
}
