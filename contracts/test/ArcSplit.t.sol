// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ArcSplitFactory, ArcSplitVault, IERC20} from "../src/ArcSplitFactory.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
}

contract ArcSplitTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address owner = address(0xA11CE);
    address alice = address(0xB0B);
    address bob = address(0xCA11);
    address carol = address(0xC0);

    function _revert(string memory message) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", message);
    }

    function _twoParty(uint16 aliceBps, uint16 bobBps) internal view returns (address[] memory recipients, uint16[] memory bps) {
        recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        bps = new uint16[](2);
        bps[0] = aliceBps;
        bps[1] = bobBps;
    }

    function _deployVault(MockUSDC token, address[] memory recipients, uint16[] memory bps) internal returns (ArcSplitFactory factory, ArcSplitVault vault) {
        factory = new ArcSplitFactory(address(token));
        vm.prank(owner);
        vault = ArcSplitVault(factory.createSplit(recipients, bps));
    }

    function _fund(MockUSDC token, ArcSplitVault vault, uint256 amount) internal {
        token.mint(owner, amount);
        vm.startPrank(owner);
        token.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function testDepositAllocatesAndClaims() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);

        _fund(token, vault, 100_000_000);

        require(vault.claimableOf(alice) == 60_000_000, "alice allocation");
        require(vault.claimableOf(bob) == 40_000_000, "bob allocation");
        require(vault.totalDeposited() == 100_000_000, "total deposited");

        vm.prank(alice);
        vault.claim();
        require(token.balanceOf(alice) == 60_000_000, "alice claim");
        require(vault.claimableOf(alice) == 0, "alice claimable cleared");
        require(vault.claimableOf(bob) == 40_000_000, "bob untouched");
    }

    function testRemainderGoesToLastRecipient() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(5_000, 5_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);

        _fund(token, vault, 1);

        require(vault.claimableOf(alice) == 0, "first share floors to zero");
        require(vault.claimableOf(bob) == 1, "remainder assigned to last recipient");
        require(vault.totalDeposited() == 1, "full unit accounted");
    }

    function testOddAmountThreeWaysUsesLastRecipientDust() external {
        MockUSDC token = new MockUSDC();
        address[] memory recipients = new address[](3);
        recipients[0] = alice;
        recipients[1] = bob;
        recipients[2] = carol;
        uint16[] memory bps = new uint16[](3);
        bps[0] = 3_333;
        bps[1] = 3_333;
        bps[2] = 3_334;

        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);
        _fund(token, vault, 100);

        require(vault.claimableOf(alice) == 33, "alice floor");
        require(vault.claimableOf(bob) == 33, "bob floor");
        require(vault.claimableOf(carol) == 34, "carol receives remainder");
        require(
            vault.claimableOf(alice) + vault.claimableOf(bob) + vault.claimableOf(carol) == 100,
            "no leaked units"
        );
    }

    function testMultipleDepositsAccumulate() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);

        _fund(token, vault, 100_000_000);
        _fund(token, vault, 50_000_000);

        require(vault.claimableOf(alice) == 90_000_000, "alice accumulated");
        require(vault.claimableOf(bob) == 60_000_000, "bob accumulated");
        require(vault.totalDeposited() == 150_000_000, "deposits summed");
    }

    function testDoubleClaimReverts() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);
        _fund(token, vault, 100_000_000);

        vm.prank(alice);
        vault.claim();

        vm.expectRevert(_revert("Nothing claimable"));
        vm.prank(alice);
        vault.claim();
    }

    function testNonRecipientClaimReverts() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);
        _fund(token, vault, 100_000_000);

        vm.expectRevert(_revert("Nothing claimable"));
        vm.prank(carol);
        vault.claim();
    }

    function testZeroDepositReverts() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);

        vm.expectRevert(_revert("Amount is zero"));
        vm.prank(owner);
        vault.deposit(0);
    }

    function testFactoryRecordsVaultsByOwner() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 4_000);

        vm.prank(owner);
        address first = factory.createSplit(recipients, bps);
        vm.prank(owner);
        address second = factory.createSplit(recipients, bps);
        vm.prank(alice);
        address third = factory.createSplit(recipients, bps);

        address[] memory owned = factory.getVaultsByOwner(owner);
        require(owned.length == 2, "owner vault count");
        require(owned[0] == first && owned[1] == second, "owner vault order");
        require(factory.getVaultsByOwner(alice).length == 1, "alice vault count");
        require(factory.getVaultsByOwner(alice)[0] == third, "alice vault");
        require(factory.allVaultsLength() == 3, "global vault count");
    }

    function testCreateSplitRejectsInvalidRecipientCount() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));

        address[] memory one = new address[](1);
        one[0] = alice;
        uint16[] memory oneBps = new uint16[](1);
        oneBps[0] = 10_000;
        vm.expectRevert(_revert("Invalid recipient count"));
        vm.prank(owner);
        factory.createSplit(one, oneBps);

        address[] memory tooMany = new address[](13);
        uint16[] memory tooManyBps = new uint16[](13);
        for (uint256 i; i < 13; ++i) {
            tooMany[i] = address(uint160(i + 1));
            tooManyBps[i] = i == 12 ? 400 : 800;
        }
        vm.expectRevert(_revert("Invalid recipient count"));
        vm.prank(owner);
        factory.createSplit(tooMany, tooManyBps);
    }

    function testCreateSplitRejectsZeroRecipient() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        address[] memory recipients = new address[](2);
        recipients[0] = address(0);
        recipients[1] = bob;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5_000;
        bps[1] = 5_000;

        vm.expectRevert(_revert("Zero recipient"));
        vm.prank(owner);
        factory.createSplit(recipients, bps);
    }

    function testCreateSplitRejectsZeroShare() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 10_000;
        bps[1] = 0;

        vm.expectRevert(_revert("Zero share"));
        vm.prank(owner);
        factory.createSplit(recipients, bps);
    }

    function testCreateSplitRejectsDuplicateRecipient() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = alice;
        uint16[] memory bps = new uint16[](2);
        bps[0] = 5_000;
        bps[1] = 5_000;

        vm.expectRevert(_revert("Duplicate recipient"));
        vm.prank(owner);
        factory.createSplit(recipients, bps);
    }

    function testCreateSplitRejectsSharesNot100Percent() external {
        MockUSDC token = new MockUSDC();
        ArcSplitFactory factory = new ArcSplitFactory(address(token));
        (address[] memory recipients, uint16[] memory bps) = _twoParty(6_000, 3_999);

        vm.expectRevert(_revert("Shares must equal 100%"));
        vm.prank(owner);
        factory.createSplit(recipients, bps);
    }

    function testFactoryRejectsZeroUsdc() external {
        vm.expectRevert(_revert("Zero USDC address"));
        new ArcSplitFactory(address(0));
    }

    function testGetRecipientsReturnsImmutableConfig() external {
        MockUSDC token = new MockUSDC();
        (address[] memory recipients, uint16[] memory bps) = _twoParty(7_250, 2_750);
        (, ArcSplitVault vault) = _deployVault(token, recipients, bps);

        (address[] memory storedRecipients, uint16[] memory storedBps) = vault.getRecipients();
        require(storedRecipients.length == 2, "recipient count");
        require(storedRecipients[0] == alice && storedRecipients[1] == bob, "recipient order");
        require(storedBps[0] == 7_250 && storedBps[1] == 2_750, "share order");
    }
}
