import { getAddress, isAddress, type Address } from 'viem'

export function vaultFromLocation(search = window.location.search): Address | undefined {
  const value = new URLSearchParams(search).get('vault')
  return value && isAddress(value) ? getAddress(value) : undefined
}

export function nameFromLocation(search = window.location.search): string | undefined {
  const value = new URLSearchParams(search).get('name')?.trim()
  return value ? value.slice(0, 40) : undefined
}

export function vaultSharePath(vault: Address, name?: string) {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('vault', vault)
  if (name?.trim()) url.searchParams.set('name', name.trim().slice(0, 40))
  return url.toString()
}

export function writeVaultIntoUrl(vault?: Address, name?: string) {
  const url = new URL(window.location.href)
  if (vault) url.searchParams.set('vault', vault)
  else url.searchParams.delete('vault')
  if (name?.trim()) url.searchParams.set('name', name.trim().slice(0, 40))
  else url.searchParams.delete('name')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
