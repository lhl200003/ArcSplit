import { getAddress, isAddress, parseEventLogs, parseUnits, type Address } from 'viem'
import { ARC_USDC_ADDRESS } from '../config/arc'
import { arcPublicClient, getWalletClient, type WalletProvider } from './wallet'

const FALLBACK_FACTORY = '0x7181198ee7c390D2eCC9B7d856A0ACB12Bcf2746'
const configuredFactory = import.meta.env.VITE_ARC_SPLIT_FACTORY_ADDRESS || FALLBACK_FACTORY
export const factoryAddress = configuredFactory && isAddress(configuredFactory) ? getAddress(configuredFactory) : undefined
export const isFactoryConfigured = Boolean(factoryAddress)

export const erc20Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

export const factoryAbi = [
  { type: 'function', name: 'createSplit', stateMutability: 'nonpayable', inputs: [{ name: 'recipients', type: 'address[]' }, { name: 'bps', type: 'uint16[]' }], outputs: [{ name: 'vault', type: 'address' }] },
  { type: 'function', name: 'getVaultsByOwner', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'allVaults', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'allVaultsLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'event', name: 'SplitCreated', inputs: [{ indexed: true, name: 'owner', type: 'address' }, { indexed: true, name: 'vault', type: 'address' }, { indexed: false, name: 'recipients', type: 'uint256' }], anonymous: false },
] as const

export const vaultAbi = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimableOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalDeposited', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getRecipients', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }, { type: 'uint16[]' }] },
  { type: 'event', name: 'Deposited', inputs: [{ indexed: true, name: 'depositor', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], anonymous: false },
  { type: 'event', name: 'Claimed', inputs: [{ indexed: true, name: 'recipient', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }], anonymous: false },
] as const

export type VaultData = { address: Address; recipients: Address[]; bps: number[]; totalDeposited: bigint; claimable: bigint }

function requireFactory(): Address {
  if (!factoryAddress) throw new Error('ArcSplit factory is not configured. Deploy the contracts, then add VITE_ARC_SPLIT_FACTORY_ADDRESS to .env.')
  return factoryAddress
}

export async function listVaults(owner: Address) {
  const factory = requireFactory()
  const vaults = await arcPublicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'getVaultsByOwner', args: [owner] })
  return [...vaults]
}

/** Vaults this account created, is a recipient of, or opened via a share link. */
export async function listAccessibleVaults(account: Address, extra: Address[] = []) {
  const factory = requireFactory()
  const owned = await listVaults(account)
  const length = await arcPublicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'allVaultsLength' })
  const total = Number(length)
  const start = Math.max(0, total - 80)
  const recent = await Promise.all(
    Array.from({ length: total - start }, (_, index) =>
      arcPublicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'allVaults', args: [BigInt(start + index)] }),
    ),
  )

  const unique = [...new Set([...owned, ...recent, ...extra].map((value) => getAddress(value)))]
  const accountHex = account.toLowerCase()
  const extraSet = new Set(extra.map((value) => getAddress(value).toLowerCase()))
  const ownedSet = new Set(owned.map((value) => getAddress(value).toLowerCase()))

  const visible: Address[] = []
  await Promise.all(unique.map(async (vault) => {
    if (ownedSet.has(vault.toLowerCase()) || extraSet.has(vault.toLowerCase())) {
      visible.push(vault)
      return
    }
    try {
      const [recipients] = await arcPublicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'getRecipients' })
      if (recipients.some((recipient) => recipient.toLowerCase() === accountHex)) visible.push(vault)
    } catch {
      /* ignore malformed vault addresses */
    }
  }))

  const ordered = [...owned]
  for (const vault of visible) {
    if (!ordered.some((item) => item.toLowerCase() === vault.toLowerCase())) ordered.push(vault)
  }
  return ordered
}

export async function readVault(vault: Address, account: Address): Promise<VaultData> {
  const [recipientsResponse, totalDeposited, claimable] = await Promise.all([
    arcPublicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'getRecipients' }),
    arcPublicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'totalDeposited' }),
    arcPublicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'claimableOf', args: [account] }),
  ])
  const [recipients, bps] = recipientsResponse
  return { address: vault, recipients: Array.from(recipients), bps: Array.from(bps, Number), totalDeposited, claimable }
}

export async function readAllowance(owner: Address, spender: Address) {
  return arcPublicClient.readContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] })
}

export async function approveUsdc(provider: WalletProvider, account: Address, spender: Address, amount: bigint) {
  const client = getWalletClient(provider)
  const hash = await client.writeContract({ account, address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [spender, amount] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function createSplit(provider: WalletProvider, account: Address, recipients: Address[], bps: number[]) {
  const factory = requireFactory()
  const client = getWalletClient(provider)
  const hash = await client.writeContract({ account, address: factory, abi: factoryAbi, functionName: 'createSplit', args: [recipients, bps] })
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash })
  const logs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: 'SplitCreated' })
  const vault = logs[0]?.args.vault
  if (!vault) throw new Error('Split was created, but the factory event could not be decoded.')
  return { receipt, vault }
}

export async function depositToVault(provider: WalletProvider, account: Address, vault: Address, amount: string) {
  const client = getWalletClient(provider)
  const hash = await client.writeContract({ account, address: vault, abi: vaultAbi, functionName: 'deposit', args: [parseUnits(amount, 6)] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}

export async function claimFromVault(provider: WalletProvider, account: Address, vault: Address) {
  const client = getWalletClient(provider)
  const hash = await client.writeContract({ account, address: vault, abi: vaultAbi, functionName: 'claim', args: [] })
  return arcPublicClient.waitForTransactionReceipt({ hash })
}
