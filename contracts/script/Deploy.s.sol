// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallAttestation} from "../src/CallAttestation.sol";
import {ReputationEscrow} from "../src/ReputationEscrow.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        AgentRegistry registry = new AgentRegistry();
        CallAttestation attestations = new CallAttestation(address(registry));
        ReputationEscrow escrow = new ReputationEscrow(address(registry), address(attestations));

        vm.stopBroadcast();

        console2.log("AgentRegistry    :", address(registry));
        console2.log("CallAttestation  :", address(attestations));
        console2.log("ReputationEscrow :", address(escrow));
    }
}
