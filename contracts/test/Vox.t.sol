// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallAttestation} from "../src/CallAttestation.sol";
import {ReputationEscrow} from "../src/ReputationEscrow.sol";

contract VoxTest is Test {
    AgentRegistry registry;
    CallAttestation attestations;
    ReputationEscrow escrow;

    address operator = address(0xA11CE);
    address agent = address(0xB0B);
    address merchant = address(0xCAFE);

    function setUp() public {
        registry = new AgentRegistry();
        attestations = new CallAttestation(address(registry));
        escrow = new ReputationEscrow(address(registry), address(attestations));

        vm.prank(operator);
        registry.registerAgent(agent, "Vox-Demo", AgentRegistry.AgentType.COLLECTIONS, "emi_reminder,payment_promise");

        vm.deal(merchant, 10 ether);
        vm.prank(merchant);
        escrow.deposit{value: 1 ether}();
    }

    function test_RegisterAndAttest() public {
        uint256 id = attestations.attestCall(agent, keccak256("hello"), CallAttestation.Outcome.PAID, 32);
        assertEq(id, 0);
        assertEq(attestations.totalCalls(), 1);
    }

    function test_ReleasePayoutAndReputation() public {
        uint256 opStart = operator.balance;
        uint256 id = attestations.attestCall(agent, keccak256("t1"), CallAttestation.Outcome.PAID, 30);
        escrow.releaseForCall(id, merchant);
        assertEq(operator.balance - opStart, 0.05 ether);
        assertEq(escrow.reputation(agent), 10);
        assertEq(escrow.merchantBalance(merchant), 1 ether - 0.05 ether);
    }

    function test_CannotDoubleRelease() public {
        uint256 id = attestations.attestCall(agent, keccak256("t2"), CallAttestation.Outcome.PROMISED, 22);
        escrow.releaseForCall(id, merchant);
        vm.expectRevert(ReputationEscrow.AlreadyReleased.selector);
        escrow.releaseForCall(id, merchant);
    }

    function test_DncNoPayoutButNegativeRep() public {
        uint256 id = attestations.attestCall(agent, keccak256("t3"), CallAttestation.Outcome.DNC, 5);
        escrow.releaseForCall(id, merchant);
        assertEq(escrow.reputation(agent), -5);
    }
}
