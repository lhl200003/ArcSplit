import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function shortAddress(value?: string, chars = 4) {
  if (!value) return 'Not connected'
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`
}

export function formatUsdc(value?: bigint, digits = 2) {
  if (value === undefined) return '—'
  const numeric = Number(value) / 1_000_000
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric)
}

export function explorerTx(hash: string) { return `https://testnet.arcscan.app/tx/${hash}` }
export function explorerAddress(address: string) { return `https://testnet.arcscan.app/address/${address}` }
