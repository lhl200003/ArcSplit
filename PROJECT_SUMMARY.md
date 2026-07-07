# ArcSplit Project Summary

## One-line description
ArcSplit is a non-custodial USDC distribution workspace on Arc Testnet where teams create immutable payout rules, fund one smart-contract vault, and let each recipient claim their share from their own wallet.

## User journey
1. Connect an EIP-6963-compatible browser wallet.
2. Switch to Arc Testnet.
3. Define 2–12 recipient wallets and shares totaling 100%.
4. Sign `createSplit` to deploy a dedicated immutable vault.
5. Enter an amount and sign USDC `approve` if allowance is not sufficient.
6. Sign `deposit` to record onchain recipient claimable balances.
7. Each recipient connects their own wallet and signs `claim`.

## Contract architecture
- `ArcSplitFactory` deploys a unique vault for each split configuration.
- `ArcSplitVault` receives ERC-20 USDC via `transferFrom`.
- Claims are pull-based. No backend wallet can trigger a recipient withdrawal.
- A vault permits no owner withdrawal and no post-deployment recipient/share edits.

## Required frontend environment variable
```env
VITE_ARC_SPLIT_FACTORY_ADDRESS=0xYourDeployedFactoryAddress
```

## Arc configuration
- Network: Arc Testnet
- Chain ID: 5042002
- RPC: https://rpc.testnet.arc.network
- Explorer: https://testnet.arcscan.app
- ERC-20 USDC: 0x3600000000000000000000000000000000000000
- Application precision: 6 decimals

## UI direction
ArcSplit intentionally uses a warm capital-management visual system: champagne, orange, cream, dark ledger brown, and high-contrast settlement status. It is structurally and visually separate from ArcRoute’s cool-toned cross-chain terminal.
