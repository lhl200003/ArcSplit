import { getAddress, isAddress } from 'viem'

export const BPS_DENOMINATOR = 10_000
export const MIN_RECIPIENTS = 2
export const MAX_RECIPIENTS = 12

export type RecipientDraft = { address: string; share: string }

export function parseShare(value: string) {
  const share = Number(value)
  return Number.isFinite(share) ? share : NaN
}

/** Convert UI percents to onchain BPS. Last recipient absorbs ±1–2 rounding dust. */
export function percentsToBps(percents: number[]) {
  const bps = percents.map((percent) => Math.round(percent * 100))
  if (bps.length === 0) return bps
  const total = bps.reduce((sum, value) => sum + value, 0)
  bps[bps.length - 1] += BPS_DENOMINATOR - total
  return bps
}

export function validateSplit(recipients: RecipientDraft[]) {
  if (recipients.length < MIN_RECIPIENTS || recipients.length > MAX_RECIPIENTS) {
    return { ok: false as const, message: 'Use 2–12 recipient wallets.', bps: [] as number[] }
  }

  const percents: number[] = []
  const normalized: string[] = []

  for (const row of recipients) {
    const address = row.address.trim()
    if (!isAddress(address)) {
      return { ok: false as const, message: 'Every recipient needs a valid wallet address.', bps: [] as number[] }
    }
    const share = parseShare(row.share)
    if (!Number.isFinite(share) || share <= 0) {
      return { ok: false as const, message: 'Every share must be greater than 0%.', bps: [] as number[] }
    }
    percents.push(share)
    normalized.push(getAddress(address).toLowerCase())
  }

  if (new Set(normalized).size !== normalized.length) {
    return { ok: false as const, message: 'Recipient wallets must be unique.', bps: [] as number[] }
  }

  const totalPercent = percents.reduce((sum, value) => sum + value, 0)
  if (Math.abs(totalPercent - 100) > 0.05) {
    return { ok: false as const, message: 'Shares must total 100%.', bps: [] as number[] }
  }

  const bps = percentsToBps(percents)
  if (bps.some((value) => value <= 0) || bps.reduce((sum, value) => sum + value, 0) !== BPS_DENOMINATOR) {
    return { ok: false as const, message: 'These percentages cannot be represented as onchain basis points. Adjust the last share slightly.', bps: [] as number[] }
  }

  return { ok: true as const, message: '', bps }
}
