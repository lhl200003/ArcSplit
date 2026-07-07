# ArcSplit — Programmable USDC Distribution on Arc Testnet

ArcSplit is a non-custodial USDC distribution DApp for Arc Testnet. It allows a creator or team to deploy an immutable split rule, fund it with USDC, and let each designated recipient claim their share directly from their own EVM wallet.

## What it does

- Connects compatible EVM browser wallets using EIP-6963 discovery.
- Detects Arc Testnet and requests a wallet switch or network addition when necessary.
- Creates an immutable `ArcSplitVault` with 2–12 recipient wallets and basis-point allocation shares totaling exactly 10,000 bps.
- Requests an ERC-20 USDC `approve` transaction before a vault `deposit` when allowance is insufficient.
- Records recipient claimable balances onchain immediately after a successful deposit.
- Lets every eligible recipient call `claim()` from their own wallet.
- Shows pending, success, failed, and transaction-hash states in the product interface.
- Never requests, stores, transmits, or signs with user private keys.

## Arc Testnet configuration

| Item | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Application USDC interface | `0x3600000000000000000000000000000000000000` |
| USDC application precision | 6 decimals |

Arc uses USDC as its native gas token. For application-level accounting, ArcSplit intentionally uses the documented ERC-20 USDC interface, which supports `approve`, `allowance`, `transfer`, and `transferFrom` with 6 decimals. Do not mix the ERC-20’s 6-decimal values with Arc’s 18-decimal native-gas representation.

## Architecture

```text
Browser wallet
   │
   ├─ createSplit(recipients, bps)
   │        │
   │        └─ ArcSplitFactory deploys one immutable ArcSplitVault
   │
   ├─ USDC approve(vault, amount)
   │
   ├─ vault.deposit(amount)
   │        │
   │        └─ Updates claimableOf[recipient] for every member
   │
   └─ vault.claim()
            │
            └─ Transfers the recipient’s USDC to their wallet
```

The frontend is fully client-side. There is no backend signer, user custody account, or private-key database.

## Repository layout

```text
arcsplit/
├─ src/                    # React + TypeScript + Vite frontend
│  ├─ services/            # Wallet discovery, Arc switch, contract calls
│  ├─ components/          # Wallet modal
│  └─ config/              # Arc Testnet settings
├─ contracts/              # Foundry Solidity project
│  ├─ src/ArcSplitFactory.sol
│  ├─ script/DeployArcSplit.s.sol
│  └─ test/ArcSplit.t.sol
├─ .env.example            # Frontend factory-address configuration
└─ README.md
```

## Run the frontend

### 1. Install packages

```bash
npm install
```

### 2. Configure your deployed factory

Copy the frontend environment template:

```bash
copy .env.example .env
```

Then set the contract address after deploying the factory:

```env
VITE_ARC_SPLIT_FACTORY_ADDRESS=0xYourDeployedFactoryAddress
```

### 3. Start the app

```bash
npm run dev
```

Open the local URL shown by Vite, normally `http://localhost:5173`.

## Deploy the smart contract to Arc Testnet

The contract lives in the `contracts` directory and uses Foundry.

### 1. Install Foundry

Follow the official Foundry installation instructions for your operating system, then open a terminal in `contracts`.

```bash
cd contracts
forge build
forge test
```

### 2. Create a local deployment environment file

```bash
copy .env.example .env
```

Set a dedicated **testnet-only** deployer private key and keep it outside Git:

```env
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
DEPLOYER_PRIVATE_KEY=0xyour_testnet_private_key
```

Your deployer needs Arc Testnet USDC because USDC is used as gas on Arc.

### 3. Deploy

**PowerShell:**

```powershell
$env:ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
$env:DEPLOYER_PRIVATE_KEY="0xyour_testnet_private_key"
forge script script/DeployArcSplit.s.sol:DeployArcSplit --rpc-url $env:ARC_TESTNET_RPC_URL --private-key $env:DEPLOYER_PRIVATE_KEY --broadcast
```

Copy the factory address printed after deployment. Put it into the root frontend `.env` file as `VITE_ARC_SPLIT_FACTORY_ADDRESS`, then restart `npm run dev`.

## Contract behavior and safety notes

`ArcSplitFactory` deploys a dedicated `ArcSplitVault` for every split configuration.

Each vault:

- Accepts 2–12 unique recipient addresses.
- Requires shares to total exactly `10,000` basis points.
- Does not expose an owner withdrawal method.
- Uses pull payments: recipients claim their own balances.
- Assigns any integer rounding remainder to the final recipient so that all deposited USDC is fully accounted for.
- Does not allow recipient or share edits after deployment.

This is a testnet prototype and has not undergone an independent security audit. Do not use it with production assets.

## UI system

ArcSplit intentionally has a separate product identity from ArcRoute:

- **Landing page:** editorial finance style with warm orange, champagne, stone, and deep ledger tones.
- **Functional modules:** split editor, settlement workspace, allocation map, recipient claim panel, and activity rail.
- **Terminal:** high-density information layout inspired by HyperUI and shadcn interaction patterns.
- **Wallet, form, and transaction states:** modal, alerts, loading states, and account controls follow shadcn-style behavior.

## Demo flow

1. Connect MetaMask, OKX Wallet, or another EIP-6963-compatible EVM wallet.
2. Switch to Arc Testnet.
3. Create a 50/30/20 split with valid wallet addresses.
4. Confirm `createSplit` in the wallet.
5. Select the created vault in the settlement terminal.
6. Enter a USDC amount.
7. Confirm the USDC approval if needed.
8. Confirm the vault deposit.
9. Connect each recipient wallet separately and call `claim()`.
10. Inspect every transaction in ArcScan.

## Sources

- Arc contract addresses and USDC interface: official Arc documentation.
- Arc’s EVM behavior and USDC decimal distinction: official Arc documentation.
- Arc deployment tooling: official Arc Solidity/Foundry deployment tutorial.
