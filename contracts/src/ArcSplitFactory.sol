// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice A recipient-owned USDC distribution vault. Claims are pull-based.
contract ArcSplitVault {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant MAX_RECIPIENTS = 12;

    IERC20 public immutable usdc;
    address public immutable owner;
    address[] private recipients;
    uint16[] private sharesBps;

    mapping(address => uint256) public claimableOf;
    uint256 public totalDeposited;

    event Deposited(address indexed depositor, uint256 amount);
    event Claimed(address indexed recipient, uint256 amount);

    constructor(address owner_, address usdc_, address[] memory recipients_, uint16[] memory sharesBps_) {
        require(owner_ != address(0) && usdc_ != address(0), "Zero address");
        require(recipients_.length >= 2 && recipients_.length <= MAX_RECIPIENTS, "Invalid recipient count");
        require(recipients_.length == sharesBps_.length, "Length mismatch");

        uint256 totalBps;
        for (uint256 i; i < recipients_.length; ++i) {
            require(recipients_[i] != address(0), "Zero recipient");
            require(sharesBps_[i] > 0, "Zero share");
            for (uint256 j; j < i; ++j) require(recipients_[j] != recipients_[i], "Duplicate recipient");
            recipients.push(recipients_[i]);
            sharesBps.push(sharesBps_[i]);
            totalBps += sharesBps_[i];
        }
        require(totalBps == BPS_DENOMINATOR, "Shares must equal 100%" );
        owner = owner_;
        usdc = IERC20(usdc_);
    }

    function getRecipients() external view returns (address[] memory, uint16[] memory) {
        return (recipients, sharesBps);
    }

    /// @notice Deposits ERC-20 USDC and updates recipient claims proportionally.
    /// Rounding dust is assigned to the final recipient so every deposited unit is accounted for.
    function deposit(uint256 amount) external {
        require(amount > 0, "Amount is zero");
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");

        uint256 allocated;
        uint256 finalIndex = recipients.length - 1;
        for (uint256 i; i < recipients.length; ++i) {
            uint256 allocation = i == finalIndex ? amount - allocated : (amount * sharesBps[i]) / BPS_DENOMINATOR;
            claimableOf[recipients[i]] += allocation;
            allocated += allocation;
        }
        totalDeposited += amount;
        emit Deposited(msg.sender, amount);
    }

    function claim() external {
        uint256 amount = claimableOf[msg.sender];
        require(amount > 0, "Nothing claimable");
        claimableOf[msg.sender] = 0;
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit Claimed(msg.sender, amount);
    }
}

/// @notice Factory that creates immutable ArcSplitVaults using Arc’s standard ERC-20 USDC interface.
contract ArcSplitFactory {
    address public immutable usdc;
    address[] public allVaults;
    mapping(address => address[]) private vaultsByOwner;

    event SplitCreated(address indexed owner, address indexed vault, uint256 recipients);

    constructor(address usdc_) {
        require(usdc_ != address(0), "Zero USDC address");
        usdc = usdc_;
    }

    function createSplit(address[] calldata recipients, uint16[] calldata bps) external returns (address vault) {
        ArcSplitVault split = new ArcSplitVault(msg.sender, usdc, recipients, bps);
        vault = address(split);
        allVaults.push(vault);
        vaultsByOwner[msg.sender].push(vault);
        emit SplitCreated(msg.sender, vault, recipients.length);
    }

    function getVaultsByOwner(address owner) external view returns (address[] memory) {
        return vaultsByOwner[owner];
    }

    function allVaultsLength() external view returns (uint256) {
        return allVaults.length;
    }
}
