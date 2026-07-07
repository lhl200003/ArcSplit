// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ArcSplitFactory, ArcSplitVault, IERC20} from "../src/ArcSplitFactory.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { require(balanceOf[msg.sender] >= amount, "balance"); balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true; }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) { require(allowance[from][msg.sender] >= amount, "allowance"); require(balanceOf[from] >= amount, "balance"); allowance[from][msg.sender] -= amount; balanceOf[from] -= amount; balanceOf[to] += amount; return true; }
}

interface Vm { function prank(address) external; }

contract ArcSplitTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address owner = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCA11);

    function testDepositAllocatesAndClaims() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        address[] memory recipients = new address[](2);
        recipients[0] = alice; recipients[1] = bob;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 6_000; bps[1] = 4_000;
        vm.prank(owner);
        address vaultAddress = factory.createSplit(recipients, bps);
        ArcSplitVault vault = ArcSplitVault(vaultAddress);

        token.mint(owner, 100_000_000); // 100 USDC, 6 decimals
        vm.prank(owner); token.approve(vaultAddress, 100_000_000);
        vm.prank(owner); vault.deposit(100_000_000);
        require(vault.claimableOf(alice) == 60_000_000, "alice allocation");
        require(vault.claimableOf(bob) == 40_000_000, "bob allocation");
        vm.prank(alice); vault.claim();
        require(token.balanceOf(alice) == 60_000_000, "alice claim");
    }
}
