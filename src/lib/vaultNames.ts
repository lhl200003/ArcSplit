const STORAGE_KEY = 'arcsplit.vaultNames.v1'

export function loadVaultNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveVaultNames(names: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}

export function vaultNameKey(vault: string) {
  return vault.toLowerCase()
}
