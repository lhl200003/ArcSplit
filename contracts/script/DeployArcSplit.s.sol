// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ArcSplitFactory} from "../src/ArcSplitFactory.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployArcSplit {
    // Standard Foundry cheat-code address.
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcSplitFactory factory) {
        vm.startBroadcast();
        factory = new ArcSplitFactory(ARC_USDC);
        vm.stopBroadcast();
    }
}
