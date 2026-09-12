import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, BadgeCheck, Check, ChevronDown, CircleDollarSign, Copy, ExternalLink,
  Flame, Gauge, LayoutDashboard, Loader2, LogOut, Menu, Network, Plus, ReceiptText,
  RefreshCw, ShieldCheck, Sparkles, Split, UsersRound, WalletCards, X,
} from 'lucide-react'
import { isAddress, parseUnits, type Address } from 'viem'
import { ARC_CHAIN_ID, ARC_EXPLORER_URL } from './config/arc'
import { cn, explorerAddress, explorerTx, formatUsdc, shortAddress } from './lib/utils'
import { MAX_RECIPIENTS, validateSplit } from './lib/shares'
import { vaultFromLocation, vaultSharePath, writeVaultIntoUrl, nameFromLocation } from './lib/vaultLink'
import { loadVaultNames, saveVaultNames, vaultNameKey } from './lib/vaultNames'
import { HomeView } from './components/HomeView'
import { WalletDialog } from './components/WalletDialog'
import { connectWallet, discoverBrowserWallets, forgetWallet, getArcUsdcBalance, isArcChain, reconnectLastWallet, rememberWallet, revokeWalletSession, switchToArc, type BrowserWallet } from './services/wallet'
import {
  approveUsdc, claimFromVault, createSplit, depositToVault, isFactoryConfigured,
  listAccessibleVaults, readAllowance, readVault, type VaultData,
} from './services/contracts'

type View = 'home' | 'terminal'
type Tab = 'create' | 'settle'
type Session = { wallet: BrowserWallet; address: Address; chainId: string }
type RecipientForm = { address: string; share: string }
type Activity = { id: string; title: string; detail: string; state: 'pending' | 'success' | 'error'; hash?: string }

const ARC_FAUCET_URL = 'https://faucet.circle.com'
const ACTIVITY_KEY = 'arcsplit.activityLog.v1'
const ACTIVITY_LIMIT = 40

function loadActivities(): Activity[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Activity[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item && item.id && item.state && item.state !== 'pending').slice(0, ACTIVITY_LIMIT)
  } catch {
    return []
  }
}

function saveActivities(items: Activity[]) {
  const stored = items.filter((item) => item.state !== 'pending').slice(0, ACTIVITY_LIMIT)
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(stored))
}

const starterRecipients: RecipientForm[] = [
  { address: '', share: '50' },
  { address: '', share: '30' },
  { address: '', share: '20' },
]

function Mark({ className }: { className?: string }) {
  return <div className={cn('grid size-10 place-items-center rounded-2xl bg-[#301b11] text-[#ffd9a1] shadow-[0_10px_28px_rgba(70,36,14,.20)]', className)}>
    <Split className="size-5" strokeWidth={2.2} />
  </div>
}

function Chip({ children, tone = 'warm' }: { children: ReactNode; tone?: 'warm' | 'green' | 'dark' }) {
  const toneClass = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tone === 'dark' ? 'border-[#4a2a19] bg-[#301b11] text-[#ffddb0]' : 'border-orange-200 bg-orange-50 text-orange-700'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.12em]', toneClass)}>{children}</span>
}

function IconButton({ children, onClick, label }: { children: ReactNode; onClick?: () => void; label: string }) {
  return <button onClick={onClick} aria-label={label} className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">{children}</button>
}

function TxLink({ hash }: { hash?: string }) {
  if (!hash) return null
  return <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:text-orange-900">{shortAddress(hash, 5)}<ExternalLink className="size-3" /></a>
}

export default function App() {
  const linkedVault = vaultFromLocation()
  const [view, setView] = useState<View>(linkedVault ? 'terminal' : 'home')
  const [tab, setTab] = useState<Tab>(linkedVault ? 'settle' : 'create')
  const [menuOpen, setMenuOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [wallets, setWallets] = useState<BrowserWallet[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [balance, setBalance] = useState<bigint>()
  const [recipients, setRecipients] = useState<RecipientForm[]>(starterRecipients)
  const [vaults, setVaults] = useState<Address[]>([])
  const [activeVault, setActiveVault] = useState<Address | undefined>(linkedVault)
  const [vaultData, setVaultData] = useState<VaultData>()
  const [depositAmount, setDepositAmount] = useState('25.00')
  const [draftName, setDraftName] = useState('')
  const [vaultNames, setVaultNames] = useState<Record<string, string>>({})
  const [activities, setActivities] = useState<Activity[]>(() => loadActivities())
  const [busy, setBusy] = useState<'connect' | 'switch' | 'create' | 'fund' | 'claim' | 'refresh' | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const onArc = isArcChain(session?.chainId)
  const totalShare = recipients.reduce((sum, item) => sum + (Number(item.share) || 0), 0)
  const splitCheck = validateSplit(recipients)
  const canCreate = Boolean(session && onArc && splitCheck.ok && isFactoryConfigured && !busy)
  const canFund = Boolean(session && onArc && activeVault && Number(depositAmount) > 0 && !busy)

  const allocationRows = useMemo(() => {
    if (!vaultData) return []
    return vaultData.recipients.map((address, index) => ({ address, bps: vaultData.bps[index], value: vaultData.totalDeposited * BigInt(vaultData.bps[index]) / 10_000n }))
  }, [vaultData])

  useEffect(() => { discoverBrowserWallets().then(setWallets).catch(() => setWallets([])) }, [])

  useEffect(() => {
    if (session || wallets.length === 0) return
    let cancelled = false
    reconnectLastWallet(wallets).then((restored) => {
      if (!cancelled && restored) setSession(restored)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [wallets, session])

  useEffect(() => {
    const stored = loadVaultNames()
    const linkedName = nameFromLocation()
    if (linkedVault && linkedName) {
      stored[vaultNameKey(linkedVault)] = linkedName
      saveVaultNames(stored)
    }
    setVaultNames(stored)
  }, [])

  useEffect(() => {
    const provider = session?.wallet.provider
    if (!provider) return
    const accountsHandler = (accounts: string[]) => {
      const next = accounts[0]
      if (!next || !isAddress(next)) { setSession(null); setBalance(undefined); return }
      setSession((current) => current ? { ...current, address: next as Address } : current)
    }
    const chainHandler = (chainId: string) => setSession((current) => current ? { ...current, chainId } : current)
    provider.on?.('accountsChanged', accountsHandler)
    provider.on?.('chainChanged', chainHandler)
    return () => { provider.removeListener?.('accountsChanged', accountsHandler); provider.removeListener?.('chainChanged', chainHandler) }
  }, [session?.wallet.provider])

  useEffect(() => {
    if (!session?.address) return
    refreshBalance(session.address)
    if (isFactoryConfigured) refreshVaults(session.address)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.address, session?.chainId])

  useEffect(() => {
    if (activeVault && session?.address && onArc) refreshVault(activeVault, session.address)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVault, session?.address, session?.chainId])

  function addActivity(next: Activity) {
    setActivities((current) => {
      const index = current.findIndex((item) => item.id === next.id)
      const copy = index === -1 ? [next, ...current] : current.map((item, itemIndex) => itemIndex === index ? next : item)
      saveActivities(copy)
      return copy.slice(0, ACTIVITY_LIMIT)
    })
  }

  async function refreshBalance(address = session?.address) {
    if (!address) return
    try { setBalance(await getArcUsdcBalance(address)) } catch { /* network feedback appears on signed actions */ }
  }

  async function refreshVaults(address = session?.address) {
    if (!address || !isFactoryConfigured) return
    try {
      const extra = [linkedVault, activeVault].filter((value): value is Address => Boolean(value))
      const list = await listAccessibleVaults(address, extra)
      setVaults(list)
      setActiveVault((current) => current && list.some((vault) => vault.toLowerCase() === current.toLowerCase()) ? current : list[0])
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not load splits for this wallet.' })
    }
  }

  async function refreshVault(vault = activeVault, address = session?.address) {
    if (!vault || !address) return
    try { setVaultData(await readVault(vault, address)) } catch { setVaultData(undefined) }
  }

  async function handleConnect(wallet: BrowserWallet) {
    setBusy('connect'); setNotice(null)
    try {
      const { address, chainId } = await connectWallet(wallet.provider)
      rememberWallet(wallet)
      setSession({ wallet, address, chainId })
      setWalletOpen(false)
      setNotice({ type: 'success', message: `${wallet.info.name} is connected. ArcSplit will never request or store your private key.` })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Wallet connection was not completed.' })
    } finally { setBusy(null) }
  }

  async function handleDisconnect() {
    const provider = session?.wallet.provider
    forgetWallet()
    setSession(null)
    setBalance(undefined)
    setVaultData(undefined)
    setNotice({ type: 'info', message: 'Wallet disconnected. Refreshing the page will stay disconnected until you connect again.' })
    if (provider) await revokeWalletSession(provider)
  }

  async function handleSwitch() {
    if (!session) { setWalletOpen(true); return }
    setBusy('switch'); setNotice(null)
    try {
      await switchToArc(session.wallet.provider)
      const chainId = await session.wallet.provider.request({ method: 'eth_chainId' }) as string
      setSession({ ...session, chainId })
      setNotice({ type: 'success', message: 'Wallet switched to Arc Testnet.' })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Arc Testnet switch was declined or failed.' })
    } finally { setBusy(null) }
  }

  function updateRecipient(index: number, field: keyof RecipientForm, value: string) {
    setRecipients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row))
  }

  function setVaultName(vault: Address, name: string) {
    const key = vaultNameKey(vault)
    const trimmed = name.trim().slice(0, 40)
    setVaultNames((current) => {
      const next = { ...current }
      if (trimmed) next[key] = trimmed
      else delete next[key]
      saveVaultNames(next)
      return next
    })
  }

  function labelFor(vault: Address) {
    const name = vaultNames[vaultNameKey(vault)]
    return name ? `${name} · ${shortAddress(vault, 4)}` : shortAddress(vault, 6)
  }

  async function handleCreate() {
    if (!session || !canCreate) return
    setBusy('create'); setNotice(null)
    const activityId = `create-${Date.now()}`
    addActivity({ id: activityId, title: 'Creating distribution vault', detail: 'Confirm the createSplit transaction in your wallet.', state: 'pending' })
    try {
      const checked = validateSplit(recipients)
      if (!checked.ok) throw new Error(checked.message)
      const recipientAddresses = recipients.map((row) => row.address as Address)
      const { receipt, vault } = await createSplit(session.wallet.provider, session.address, recipientAddresses, checked.bps)
      addActivity({ id: activityId, title: 'Distribution vault created', detail: `A new immutable split rule is now live on Arc.`, state: 'success', hash: receipt.transactionHash })
      setActiveVault(vault)
      if (draftName.trim()) setVaultName(vault, draftName)
      writeVaultIntoUrl(vault, draftName.trim() || undefined)
      await refreshVaults(session.address)
      await refreshVault(vault, session.address)
      setTab('settle')
      setNotice({ type: 'success', message: 'Your ArcSplit vault is live. Fund it with USDC to create claimable balances for each member.' })
    } catch (error) {
      addActivity({ id: activityId, title: 'Vault creation failed', detail: error instanceof Error ? error.message : 'The transaction did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Split creation failed.' })
    } finally { setBusy(null) }
  }

  async function handleFund() {
    if (!session || !activeVault || !canFund) return
    setBusy('fund'); setNotice(null)
    const stamp = Date.now()
    const approvalId = `approval-${stamp}`
    const depositId = `deposit-${stamp}`
    try {
      const amount = parseUnits(depositAmount, 6)
      const allowance = await readAllowance(session.address, activeVault)
      if (allowance < amount) {
        addActivity({ id: approvalId, title: 'USDC approval requested', detail: 'Authorize this vault to pull the exact deposit amount.', state: 'pending' })
        const approval = await approveUsdc(session.wallet.provider, session.address, activeVault, amount)
        addActivity({ id: approvalId, title: 'USDC approval confirmed', detail: 'The vault can now receive this USDC deposit.', state: 'success', hash: approval.transactionHash })
      }
      addActivity({ id: depositId, title: 'Funding split vault', detail: 'Confirm the deposit in your wallet. The contract computes recipient claimables onchain.', state: 'pending' })
      const receipt = await depositToVault(session.wallet.provider, session.address, activeVault, depositAmount)
      addActivity({ id: depositId, title: 'USDC distribution recorded', detail: `${depositAmount} USDC is allocated across the vault’s recipients.`, state: 'success', hash: receipt.transactionHash })
      await Promise.all([refreshBalance(session.address), refreshVault(activeVault, session.address)])
      setNotice({ type: 'success', message: 'Funding confirmed. Recipients can now claim their proportional USDC balances.' })
    } catch (error) {
      addActivity({ id: depositId, title: 'Funding failed', detail: error instanceof Error ? error.message : 'The deposit did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Deposit failed.' })
    } finally { setBusy(null) }
  }

  async function handleClaim() {
    if (!session || !activeVault || !vaultData?.claimable || vaultData.claimable <= 0n) return
    setBusy('claim'); setNotice(null)
    const activityId = `claim-${Date.now()}`
    addActivity({ id: activityId, title: 'Claim transaction requested', detail: 'Confirm in your wallet to receive your available USDC.', state: 'pending' })
    try {
      const receipt = await claimFromVault(session.wallet.provider, session.address, activeVault)
      addActivity({ id: activityId, title: 'USDC claim confirmed', detail: 'Your claimable balance was transferred from the vault to your wallet.', state: 'success', hash: receipt.transactionHash })
      await Promise.all([refreshBalance(session.address), refreshVault(activeVault, session.address)])
      setNotice({ type: 'success', message: 'Claim completed. The USDC is now in your Arc wallet.' })
    } catch (error) {
      addActivity({ id: activityId, title: 'Claim failed', detail: error instanceof Error ? error.message : 'The claim did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Claim failed.' })
    } finally { setBusy(null) }
  }

  function useVault(value: string) {
    if (!isAddress(value)) return
    const vault = value as Address
    setActiveVault(vault)
    writeVaultIntoUrl(vault, vaultNames[vaultNameKey(vault)])
    setTab('settle')
  }

  async function copyShareLink() {
    if (!activeVault) return
    await navigator.clipboard.writeText(vaultSharePath(activeVault, vaultNames[vaultNameKey(activeVault)]))
    setNotice({ type: 'success', message: 'Share link copied. Recipients can open it and claim from their own wallet.' })
  }

  return <main className="min-h-screen overflow-x-hidden">
    <div className="orange-glow grain fixed inset-0 -z-10" />
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#fffaf2]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <button onClick={() => setView('home')} className="flex items-center gap-3 text-left"><Mark /><span><span className="block font-serif text-xl font-semibold tracking-tight text-[#2d1a10]">ArcSplit</span><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-stone-500">Distribution OS</span></span></button>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-stone-600 md:flex"><button onClick={() => setView('home')} className="hover:text-orange-700">Overview</button><a href="#how-it-works" className="hover:text-orange-700">Mechanics</a><button onClick={() => setView('terminal')} className="hover:text-orange-700">Terminal</button></nav>
        <div className="hidden items-center gap-2 md:flex">
          {session ? <><button onClick={handleSwitch} className={cn('rounded-xl border px-3 py-2 text-xs font-bold', onArc ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700')}><span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />{onArc ? 'Arc Testnet' : 'Switch to Arc'}</button><button onClick={() => setView('terminal')} className="mono rounded-xl bg-[#301b11] px-3.5 py-2.5 text-xs font-medium text-[#ffddb0]">{shortAddress(session.address)}</button><button onClick={handleDisconnect} title="Disconnect wallet" className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"><LogOut className="size-4" /></button></> : <button onClick={() => setWalletOpen(true)} className="rounded-xl bg-[#301b11] px-4 py-2.5 text-sm font-bold text-[#ffddb0] shadow-[0_8px_20px_rgba(60,30,10,.16)] transition hover:-translate-y-0.5">Connect wallet</button>}
        </div>
        <button className="md:hidden" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
      <AnimatePresence>{menuOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-stone-200 bg-[#fffaf2] px-5 pb-5 pt-2 md:hidden"><div className="grid gap-1 text-sm font-semibold text-stone-700"><button onClick={() => { setView('home'); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Overview</button><button onClick={() => { setView('terminal'); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Open terminal</button>{session ? <button onClick={() => { handleDisconnect(); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Disconnect wallet</button> : <button onClick={() => { setWalletOpen(true); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Connect wallet</button>}</div></motion.div>}</AnimatePresence>
    </header>

    {view === 'home' ? <HomeView onOpenTerminal={() => setView('terminal')} /> : <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2"><Chip tone="green"><span className="size-1.5 rounded-full bg-emerald-500" />Arc Testnet</Chip>{!isFactoryConfigured && <Chip>Deployment setup required</Chip>}</div><h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">Distribution terminal</h1><p className="mt-1 text-sm text-stone-500">Create a split, fund it with USDC, and watch claimable balances settle onchain. <a href={ARC_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">Get testnet USDC</a></p></div><div className="flex items-center gap-2"><IconButton label="Refresh dashboard" onClick={() => { if (session?.address) { refreshBalance(); refreshVaults(); refreshVault() } }}><RefreshCw className={cn('size-4', busy === 'refresh' && 'animate-spin')} /></IconButton>{session ? <><button onClick={() => navigator.clipboard.writeText(session.address)} className="mono inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-xs font-medium text-stone-700 hover:border-orange-300"><span className={cn('size-2 rounded-full', onArc ? 'bg-emerald-500' : 'bg-orange-500')} />{shortAddress(session.address)}<Copy className="size-3 text-stone-400" /></button><button onClick={handleDisconnect} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-3 text-xs font-bold text-stone-600 hover:border-orange-300 hover:text-orange-700"><LogOut className="size-3.5" />Disconnect</button></> : <button onClick={() => setWalletOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#301b11] px-4 py-3 text-sm font-bold text-[#ffddb0]"><WalletCards className="size-4" />Connect wallet</button>}</div></div>

      {notice && <div className={cn('mb-6 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm', notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-orange-200 bg-orange-50 text-orange-800')}><p>{notice.message}</p><button onClick={() => setNotice(null)} className="shrink-0 text-current/60 hover:text-current"><X className="size-4" /></button></div>}
      {!session && <div className="mb-6 rounded-[24px] border border-orange-200 bg-gradient-to-r from-orange-50 to-[#fff7eb] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#4b2715]">Connect an EVM wallet to start.</p><p className="mt-1 text-sm text-stone-600">ArcSplit uses the connected account for all contract calls. Your private key never leaves your wallet.</p></div><button onClick={() => setWalletOpen(true)} className="shrink-0 rounded-xl bg-[#301b11] px-4 py-2.5 text-sm font-bold text-[#ffddb0]">Select wallet</button></div></div>}
      {session && !onArc && <div className="mb-6 rounded-[24px] border border-orange-200 bg-orange-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-orange-900">Switch to Arc Testnet before continuing.</p><p className="mt-1 text-sm text-orange-800/80">The app detects your current chain and requests the official Arc Testnet configuration from your wallet.</p></div><button onClick={handleSwitch} disabled={busy === 'switch'} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white"><Network className="size-4" />{busy === 'switch' ? 'Switching…' : 'Switch network'}</button></div></div>}
      {session && <div className="mb-6 rounded-[24px] border border-orange-200 bg-gradient-to-r from-orange-50 to-[#fff7eb] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#4b2715]">Need Arc Testnet USDC?</p><p className="mt-1 text-sm text-stone-600">Arc uses USDC for gas and deposits. Request test tokens from Circle’s faucet with the same wallet, then come back to fund a split.</p></div><a href={ARC_FAUCET_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white">Open faucet <ExternalLink className="size-4" /></a></div></div>}
      {!isFactoryConfigured && <div className="mb-6 rounded-[24px] border border-dashed border-stone-300 bg-white/70 p-5"><p className="font-semibold text-[#4b2715]">Deploy the contract before creating live splits.</p><p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">This starter keeps the factory address out of source control. Deploy <span className="mono text-xs">contracts/src/ArcSplitFactory.sol</span> to Arc Testnet, copy its address into <span className="mono text-xs">.env</span> as <span className="mono text-xs">VITE_ARC_SPLIT_FACTORY_ADDRESS</span>, then restart the app. The UI will not imitate contract actions without a deployed factory.</p></div>}

      <div className="grid gap-5 lg:grid-cols-[1.28fr_.72fr]">
        <div className="rounded-[28px] border border-stone-200 bg-[#fffdf8]/95 shadow-[0_20px_60px_rgba(86,48,20,.08)]"><div className="border-b border-stone-200 px-5 pt-5"><div className="flex gap-6"><TabButton selected={tab === 'create'} onClick={() => setTab('create')} icon={<Plus className="size-4" />} label="Create split" /><TabButton selected={tab === 'settle'} onClick={() => setTab('settle')} icon={<Gauge className="size-4" />} label="Fund & settle" /></div></div>
          <div className="p-5 sm:p-6"><AnimatePresence mode="wait">{tab === 'create' ? <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><div className="flex items-start justify-between gap-4"><div><h2 className="font-serif text-2xl font-semibold">Create a distribution rule</h2><p className="mt-1 text-sm leading-6 text-stone-500">Each recipient and percentage is written into a dedicated ArcSplit vault. The allocation becomes immutable after creation.</p></div><span className={cn('rounded-xl px-2.5 py-2 text-xs font-bold', Math.abs(totalShare - 100) < 0.001 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700')}>{totalShare.toFixed(2)}% / 100%</span></div>
            <div className="mt-5"><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Split name (optional)</label><input value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={40} placeholder="Team payout, collab split…" className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-800 outline-none placeholder:text-stone-300 focus:border-orange-400" /><p className="mt-1 text-xs text-stone-500">Kept in this browser. Share links can include the name so recipients see it too.</p></div>
            <div className="mt-6 space-y-3">{recipients.map((row, index) => <div key={index} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_132px_40px] sm:items-center"><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Recipient {index + 1}</label><input value={row.address} onChange={(event) => updateRecipient(index, 'address', event.target.value)} placeholder="0x… wallet address" className="mono w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-300" /></div><div className="border-t border-stone-100 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Share</label><div className="flex items-center"><input value={row.share} onChange={(event) => updateRecipient(index, 'share', event.target.value)} type="number" min="0" max="100" step="0.01" className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none" /><span className="text-sm text-stone-400">%</span></div></div><button disabled={recipients.length <= 2} onClick={() => setRecipients((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="grid size-9 place-items-center rounded-xl text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="size-4" /></button></div>)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button disabled={recipients.length >= MAX_RECIPIENTS} onClick={() => setRecipients((current) => [...current, { address: '', share: '' }])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-orange-300 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-40"><Plus className="size-3.5" />Add participant</button><p className="text-xs text-stone-500">2–{MAX_RECIPIENTS} wallets · shares must total 100% · last share absorbs 0.01% rounding</p></div>
            {!splitCheck.ok && recipients.every((row) => row.address.trim() && row.share !== '') && <p className="mt-3 text-xs leading-5 text-orange-800/80">{splitCheck.message}</p>}
            <button onClick={handleCreate} disabled={!canCreate} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#301b11] px-5 py-4 text-sm font-bold text-[#ffddb0] shadow-[0_12px_28px_rgba(72,34,11,.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Split className="size-4" />}{busy === 'create' ? 'Confirming on Arc…' : !session ? 'Connect wallet to create' : !onArc ? 'Switch to Arc Testnet' : !isFactoryConfigured ? 'Deploy factory first' : 'Create immutable split'}</button>
          </motion.div> : <motion.div key="settle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold">Fund and settle</h2><p className="mt-1 text-sm leading-6 text-stone-500">A deposit immediately records each recipient’s claimable USDC balance in the selected vault.</p></div>{vaults.length > 0 && <select value={activeVault ?? ''} onChange={(event) => useVault(event.target.value)} className="max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs outline-none"><option value="">Select a vault</option>{vaults.map((vault) => <option key={vault} value={vault}>{labelFor(vault)}</option>)}</select>}</div>
            {!activeVault ? <div className="mt-7 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-7 text-center"><Split className="mx-auto size-6 text-stone-400" /><p className="mt-3 font-semibold text-stone-700">No split vault selected</p><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-stone-500">Create your first split rule, or paste a deployed ArcSplit vault address below to inspect and use it.</p><div className="mx-auto mt-4 flex max-w-sm gap-2"><input placeholder="0x… vault address" onKeyDown={(event) => { if (event.key === 'Enter') useVault(event.currentTarget.value) }} className="mono min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400" /><button onClick={(event) => { const input = event.currentTarget.previousElementSibling as HTMLInputElement; useVault(input.value) }} className="rounded-xl bg-[#301b11] px-3 text-xs font-bold text-[#ffddb0]">Open</button></div></div> : <><div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4"><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Name this vault</label><input value={activeVault ? (vaultNames[vaultNameKey(activeVault)] ?? '') : ''} onChange={(event) => { if (!activeVault) return; setVaultName(activeVault, event.target.value); writeVaultIntoUrl(activeVault, event.target.value) }} maxLength={40} placeholder="e.g. Team payout" className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none placeholder:text-stone-300" /><p className="mt-1 text-xs text-stone-500">Local label only — the onchain split rule does not change.</p></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric icon={<CircleDollarSign className="size-4" />} label="Vault funded" value={`${formatUsdc(vaultData?.totalDeposited)} USDC`} /><Metric icon={<WalletCards className="size-4" />} label="Your wallet" value={`${formatUsdc(balance)} USDC`} /><Metric icon={<BadgeCheck className="size-4" />} label="Your claimable" value={`${formatUsdc(vaultData?.claimable)} USDC`} /></div>
              <div className="mt-5 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-[#fff8ee] p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#4b2715]">Fund this split</span><span className="mono text-xs text-orange-700">USDC · 6 decimals</span></div><div className="mt-3 flex gap-2 rounded-xl border border-orange-200 bg-white p-1.5"><input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} type="number" min="0" step="0.01" className="min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#3a2114] outline-none" /><button onClick={handleFund} disabled={!canFund} className="rounded-lg bg-orange-700 px-4 text-sm font-bold text-white transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'fund' ? <Loader2 className="size-4 animate-spin" /> : 'Approve & fund'}</button></div><p className="mt-3 text-xs leading-5 text-stone-600">When allowance is insufficient, ArcSplit requests an exact USDC approval first. It then prompts a separate onchain deposit transaction. Wallet empty? <a href={ARC_FAUCET_URL} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 hover:underline">Get testnet USDC from Circle Faucet</a>.</p></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[1.1fr_.9fr]"><div className="rounded-2xl border border-stone-200 bg-white p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-stone-800">Allocation map</span><div className="flex items-center gap-2"><button onClick={copyShareLink} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">Copy share link <Copy className="size-3" /></button><a href={explorerAddress(activeVault)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">View vault <ExternalLink className="size-3" /></a></div></div><div className="mt-4 space-y-3">{allocationRows.map((row) => <div key={row.address}><div className="flex items-center justify-between gap-3 text-xs"><span className="mono truncate text-stone-600">{shortAddress(row.address, 6)}</span><span className="font-semibold text-stone-800">{(row.bps / 100).toFixed(2)}% · {formatUsdc(row.value)} USDC</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-[#d66630] to-[#f5bf76]" style={{ width: `${row.bps / 100}%` }} /></div></div>)}</div></div><div className="rounded-2xl border border-stone-200 bg-[#fff9f1] p-4"><span className="text-sm font-semibold text-stone-800">Claim your balance</span><p className="mt-2 text-sm leading-6 text-stone-500">Anyone listed as a recipient can call claim from their own wallet.</p><p className="mt-4 font-serif text-3xl font-semibold text-[#422114]">{formatUsdc(vaultData?.claimable)} <span className="text-base text-stone-500">USDC</span></p><button onClick={handleClaim} disabled={busy === 'claim' || !vaultData?.claimable || vaultData.claimable <= 0n} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#301b11] px-4 py-3 text-sm font-bold text-[#ffddb0] disabled:cursor-not-allowed disabled:opacity-40">{busy === 'claim' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Claim available USDC</button></div></div></>}
          </motion.div>}</AnimatePresence></div>
        </div>
        <aside className="space-y-5"><div className="rounded-[28px] border border-stone-200 bg-[#301b11] p-5 text-[#fff1dc] shadow-[0_20px_60px_rgba(86,48,20,.14)]"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Settlement integrity</span><ShieldCheck className="size-5 text-[#f0b96e]" /></div><div className="mt-5 space-y-4"><Integrity title="User-signed flows" text="Wallet signs creation, approval, deposit, and claims." /><Integrity title="Immutable split rules" text="Recipient addresses and basis-point shares cannot be edited after deployment." /><Integrity title="No platform account" text="The app cannot move vault funds or recover your wallet access." /></div></div><div className="rounded-[28px] border border-stone-200 bg-white/90 p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-stone-800">Onchain activity</p><p className="mt-1 text-xs text-stone-500">Kept on this device after refresh</p></div><button onClick={() => { setActivities([]); saveActivities([]) }} className="text-xs font-semibold text-stone-400 hover:text-stone-700">Clear</button></div><div className="mt-5 space-y-4">{activities.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center"><ReceiptText className="mx-auto size-5 text-stone-300" /><p className="mt-2 text-sm text-stone-500">Your signed activity will appear here.</p></div> : activities.map((item) => <div key={item.id} className="flex gap-3"><span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', item.state === 'success' ? 'bg-emerald-100 text-emerald-700' : item.state === 'error' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>{item.state === 'pending' ? <Loader2 className="size-3 animate-spin" /> : item.state === 'success' ? <Check className="size-3" /> : <X className="size-3" />}</span><div className="min-w-0"><p className="text-xs font-semibold text-stone-800">{item.title}</p><p className="mt-0.5 text-xs leading-5 text-stone-500">{item.detail}</p><div className="mt-1"><TxLink hash={item.hash} /></div></div></div>)}</div></div></aside>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/65 px-4 py-3 text-xs text-stone-500"><span>Arc chain ID <span className="mono font-medium text-stone-700">{ARC_CHAIN_ID}</span> · USDC is used for Arc gas and application settlement.</span><a href={ARC_EXPLORER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-orange-700">Open ArcScan <ExternalLink className="size-3" /></a></div>
    </section>}

    <footer className="border-t border-stone-200 bg-[#fff8ee]/80"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-7 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><span>ArcSplit · Testnet-only financial prototype. Do not use with production funds.</span><span className="mono">ARC / USDC DISTRIBUTION</span></div></footer>
    <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} wallets={wallets} onPick={handleConnect} busy={busy === 'connect'} />
  </main>
}

function TabButton({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: ReactNode; label: string }) { return <button onClick={onClick} className={cn('relative inline-flex items-center gap-2 pb-4 text-sm font-semibold', selected ? 'text-[#3a2114]' : 'text-stone-400 hover:text-stone-700')}><span className={cn('grid size-7 place-items-center rounded-lg', selected ? 'bg-orange-100 text-orange-700' : 'bg-stone-100 text-stone-400')}>{icon}</span>{label}{selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-orange-600" />}</button> }
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-stone-200 bg-white p-3.5"><div className="flex items-center gap-2 text-xs text-stone-500"><span className="text-orange-700">{icon}</span>{label}</div><p className="mt-3 text-base font-bold text-[#3d2114]">{value}</p></div> }
function Integrity({ title, text }: { title: string; text: string }) { return <div className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#5b3823] text-[#f0b96e]"><Check className="size-3" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#d9bea3]">{text}</p></div></div> }
