import { getAddress, isAddress, type Address } from 'viem'

export function vaultFromLocation(search = window.location.search): Address | undefined {
  const value = new URLSearchParams(search).get('vault')
  return value && isAddress(value) ? getAddress(value) : undefined
}

export function vaultSharePath(vault: Address) {
  return `${window.location.origin}${window.location.pathname}?vault=${vault}`
}

export function writeVaultIntoUrl(vault?: Address) {
  const url = new URL(window.location.href)
  if (vault) url.searchParams.set('vault', vault)
  else url.searchParams.delete('vault')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}
