import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, BadgeCheck, Check, ChevronDown, CircleDollarSign, Copy, ExternalLink,
  Flame, Gauge, LayoutDashboard, Loader2, Menu, Network, Plus, ReceiptText,
  RefreshCw, ShieldCheck, Sparkles, Split, UsersRound, WalletCards, X,
} from 'lucide-react'
import { isAddress, parseUnits, type Address } from 'viem'
import { ARC_CHAIN_ID, ARC_EXPLORER_URL } from './config/arc'
import { cn, explorerAddress, explorerTx, formatUsdc, shortAddress } from './lib/utils'
import { WalletDialog } from './components/WalletDialog'
import { connectWallet, discoverBrowserWallets, getArcUsdcBalance, isArcChain, switchToArc, type BrowserWallet } from './services/wallet'
import {
  approveUsdc, claimFromVault, createSplit, depositToVault, factoryAddress, isFactoryConfigured,
  listVaults, readAllowance, readVault, type VaultData,
} from './services/contracts'

type View = 'home' | 'terminal'
type Tab = 'create' | 'settle'
type Session = { wallet: BrowserWallet; address: Address; chainId: string }
type RecipientForm = { address: string; share: string }
type Activity = { id: string; title: string; detail: string; state: 'pending' | 'success' | 'error'; hash?: string }

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
  const [view, setView] = useState<View>('home')
  const [tab, setTab] = useState<Tab>('create')
  const [menuOpen, setMenuOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [wallets, setWallets] = useState<BrowserWallet[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [balance, setBalance] = useState<bigint>()
  const [recipients, setRecipients] = useState<RecipientForm[]>(starterRecipients)
  const [vaults, setVaults] = useState<Address[]>([])
  const [activeVault, setActiveVault] = useState<Address>()
  const [vaultData, setVaultData] = useState<VaultData>()
  const [depositAmount, setDepositAmount] = useState('25.00')
  const [activities, setActivities] = useState<Activity[]>([])
  const [busy, setBusy] = useState<'connect' | 'switch' | 'create' | 'fund' | 'claim' | 'refresh' | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  const onArc = isArcChain(session?.chainId)
  const totalShare = recipients.reduce((sum, item) => sum + (Number(item.share) || 0), 0)
  const validRecipients = recipients.length >= 2 && recipients.every((row) => isAddress(row.address) && Number(row.share) > 0) && Math.abs(totalShare - 100) < 0.00001
  const canCreate = Boolean(session && onArc && validRecipients && isFactoryConfigured && !busy)
  const canFund = Boolean(session && onArc && activeVault && Number(depositAmount) > 0 && !busy)

  const allocationRows = useMemo(() => {
    if (!vaultData) return []
    return vaultData.recipients.map((address, index) => ({ address, bps: vaultData.bps[index], value: vaultData.totalDeposited * BigInt(vaultData.bps[index]) / 10_000n }))
  }, [vaultData])

  useEffect(() => { discoverBrowserWallets().then(setWallets).catch(() => setWallets([])) }, [])

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
      if (index === -1) return [next, ...current]
      const copy = [...current]; copy[index] = next; return copy
    })
  }

  async function refreshBalance(address = session?.address) {
    if (!address) return
    try { setBalance(await getArcUsdcBalance(address)) } catch { /* network feedback appears on signed actions */ }
  }

  async function refreshVaults(address = session?.address) {
    if (!address || !isFactoryConfigured) return
    try {
      const list = await listVaults(address)
      setVaults(list)
      setActiveVault((current) => current && list.includes(current) ? current : list[0])
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Could not load your created splits.' })
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
      setSession({ wallet, address, chainId })
      setWalletOpen(false)
      setNotice({ type: 'success', message: `${wallet.info.name} is connected. ArcSplit will never request or store your private key.` })
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Wallet connection was not completed.' })
    } finally { setBusy(null) }
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

  async function handleCreate() {
    if (!session || !canCreate) return
    setBusy('create'); setNotice(null)
    addActivity({ id: 'create', title: 'Creating distribution vault', detail: 'Confirm the createSplit transaction in your wallet.', state: 'pending' })
    try {
      const recipientAddresses = recipients.map((row) => row.address as Address)
      const bps = recipients.map((row) => Math.round(Number(row.share) * 100))
      const { receipt, vault } = await createSplit(session.wallet.provider, session.address, recipientAddresses, bps)
      addActivity({ id: 'create', title: 'Distribution vault created', detail: `A new immutable split rule is now live on Arc.`, state: 'success', hash: receipt.transactionHash })
      setActiveVault(vault)
      await refreshVaults(session.address)
      await refreshVault(vault, session.address)
      setTab('settle')
      setNotice({ type: 'success', message: 'Your ArcSplit vault is live. Fund it with USDC to create claimable balances for each member.' })
    } catch (error) {
      addActivity({ id: 'create', title: 'Vault creation failed', detail: error instanceof Error ? error.message : 'The transaction did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Split creation failed.' })
    } finally { setBusy(null) }
  }

  async function handleFund() {
    if (!session || !activeVault || !canFund) return
    setBusy('fund'); setNotice(null)
    try {
      const amount = parseUnits(depositAmount, 6)
      const allowance = await readAllowance(session.address, activeVault)
      if (allowance < amount) {
        addActivity({ id: 'approval', title: 'USDC approval requested', detail: 'Authorize this vault to pull the exact deposit amount.', state: 'pending' })
        const approval = await approveUsdc(session.wallet.provider, session.address, activeVault, amount)
        addActivity({ id: 'approval', title: 'USDC approval confirmed', detail: 'The vault can now receive this USDC deposit.', state: 'success', hash: approval.transactionHash })
      }
      addActivity({ id: 'deposit', title: 'Funding split vault', detail: 'Confirm the deposit in your wallet. The contract computes recipient claimables onchain.', state: 'pending' })
      const receipt = await depositToVault(session.wallet.provider, session.address, activeVault, depositAmount)
      addActivity({ id: 'deposit', title: 'USDC distribution recorded', detail: `${depositAmount} USDC is allocated across the vault’s recipients.`, state: 'success', hash: receipt.transactionHash })
      await Promise.all([refreshBalance(session.address), refreshVault(activeVault, session.address)])
      setNotice({ type: 'success', message: 'Funding confirmed. Recipients can now claim their proportional USDC balances.' })
    } catch (error) {
      addActivity({ id: 'deposit', title: 'Funding failed', detail: error instanceof Error ? error.message : 'The deposit did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Deposit failed.' })
    } finally { setBusy(null) }
  }

  async function handleClaim() {
    if (!session || !activeVault || !vaultData?.claimable || vaultData.claimable <= 0n) return
    setBusy('claim'); setNotice(null)
    addActivity({ id: 'claim', title: 'Claim transaction requested', detail: 'Confirm in your wallet to receive your available USDC.', state: 'pending' })
    try {
      const receipt = await claimFromVault(session.wallet.provider, session.address, activeVault)
      addActivity({ id: 'claim', title: 'USDC claim confirmed', detail: 'Your claimable balance was transferred from the vault to your wallet.', state: 'success', hash: receipt.transactionHash })
      await Promise.all([refreshBalance(session.address), refreshVault(activeVault, session.address)])
      setNotice({ type: 'success', message: 'Claim completed. The USDC is now in your Arc wallet.' })
    } catch (error) {
      addActivity({ id: 'claim', title: 'Claim failed', detail: error instanceof Error ? error.message : 'The claim did not complete.', state: 'error' })
      setNotice({ type: 'error', message: error instanceof Error ? error.message : 'Claim failed.' })
    } finally { setBusy(null) }
  }

  function useVault(value: string) { if (isAddress(value)) { setActiveVault(value as Address); setTab('settle') } }

  return <main className="min-h-screen overflow-x-hidden">
    <div className="orange-glow grain fixed inset-0 -z-10" />
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#fffaf2]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
        <button onClick={() => setView('home')} className="flex items-center gap-3 text-left"><Mark /><span><span className="block font-serif text-xl font-semibold tracking-tight text-[#2d1a10]">ArcSplit</span><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-stone-500">Distribution OS</span></span></button>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-stone-600 md:flex"><button onClick={() => setView('home')} className="hover:text-orange-700">Overview</button><a href="#how-it-works" className="hover:text-orange-700">Mechanics</a><button onClick={() => setView('terminal')} className="hover:text-orange-700">Terminal</button></nav>
        <div className="hidden items-center gap-2 md:flex">
          {session ? <><button onClick={handleSwitch} className={cn('rounded-xl border px-3 py-2 text-xs font-bold', onArc ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700')}><span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />{onArc ? 'Arc Testnet' : 'Switch to Arc'}</button><button onClick={() => setView('terminal')} className="mono rounded-xl bg-[#301b11] px-3.5 py-2.5 text-xs font-medium text-[#ffddb0]">{shortAddress(session.address)}</button></> : <button onClick={() => setWalletOpen(true)} className="rounded-xl bg-[#301b11] px-4 py-2.5 text-sm font-bold text-[#ffddb0] shadow-[0_8px_20px_rgba(60,30,10,.16)] transition hover:-translate-y-0.5">Connect wallet</button>}
        </div>
        <button className="md:hidden" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
      <AnimatePresence>{menuOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-stone-200 bg-[#fffaf2] px-5 pb-5 pt-2 md:hidden"><div className="grid gap-1 text-sm font-semibold text-stone-700"><button onClick={() => { setView('home'); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Overview</button><button onClick={() => { setView('terminal'); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Open terminal</button><button onClick={() => { setWalletOpen(true); setMenuOpen(false) }} className="rounded-xl px-3 py-2 text-left hover:bg-orange-50">Connect wallet</button></div></motion.div>}</AnimatePresence>
    </header>

    {view === 'home' ? <>
      <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-24 lg:pt-24">
        <div className="relative z-10 max-w-2xl">
          <Chip><Sparkles className="size-3" />Built for Arc Testnet</Chip>
          <h1 className="mt-6 font-serif text-5xl font-semibold leading-[.98] tracking-[-.045em] text-[#2d1a10] sm:text-6xl lg:text-7xl">One deposit.<br /><em className="font-serif text-[#c55322]">Every contribution</em><br />accounted for.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-stone-600">ArcSplit turns shared USDC revenue into transparent, programmable distribution. Create an immutable split rule, fund it once, and let each participant claim exactly what they earned.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => setView('terminal')} className="group inline-flex items-center gap-2 rounded-2xl bg-[#301b11] px-5 py-3.5 text-sm font-bold text-[#ffddb0] shadow-[0_14px_35px_rgba(73,36,12,.20)] transition hover:-translate-y-0.5">Launch distribution terminal <ArrowRight className="size-4 transition group-hover:translate-x-1" /></button><a href="#how-it-works" className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white/70 px-5 py-3.5 text-sm font-bold text-stone-700 transition hover:border-orange-300 hover:bg-orange-50">See the mechanics <ChevronDown className="size-4" /></a></div>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3"><Stat number="6" label="USDC decimals" /><Stat number="0" label="backend custody" /><Stat number="100%" label="wallet signed" /></div>
        </div>
        <div className="relative min-h-[470px] lg:min-h-[560px]">
          <div className="absolute inset-0 rounded-[38px] border border-orange-200/80 bg-[#ffe8c8]/70 shadow-[0_30px_80px_rgba(120,67,22,.14)]" />
          <div className="ember-ring absolute left-1/2 top-1/2 size-[370px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-orange-300/80" />
          <div className="absolute left-1/2 top-1/2 size-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[18px] border-[#f7c583]/50 bg-[#fff9ef]/80 shadow-[inset_0_0_0_1px_rgba(198,109,41,.16)]" />
          <motion.div initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .7 }} className="absolute left-1/2 top-1/2 grid size-44 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[34px] bg-[#301b11] shadow-[0_24px_65px_rgba(70,33,12,.35)]"><div className="grid size-24 place-items-center rounded-[28px] border border-[#725035] bg-[#3d2517] text-[#ffd8a3]"><Split className="size-11" strokeWidth={1.6} /></div><span className="absolute -bottom-9 mono text-xs font-medium text-[#7d4929]">USDC / ALLOCATED</span></motion.div>
          <FloatCard className="left-5 top-12" icon={<UsersRound className="size-4" />} label="3 participants" value="50 / 30 / 20" /><FloatCard className="right-5 top-28" icon={<BadgeCheck className="size-4" />} label="Settlement" value="Onchain verified" dark /><FloatCard className="bottom-12 left-8" icon={<ReceiptText className="size-4" />} label="Latest payout" value="25.00 USDC" /><div className="drift absolute bottom-12 right-9 grid size-12 place-items-center rounded-2xl border border-orange-200 bg-white/85 text-orange-700 shadow-lg"><Flame className="size-5" /></div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-stone-200 bg-[#301b11] py-16 text-[#fff1db]"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><Chip tone="dark">Onchain distribution rail</Chip><h2 className="mt-5 max-w-2xl font-serif text-4xl leading-tight">From shared revenue to member-owned balances.</h2></div><p className="max-w-md text-sm leading-6 text-[#dabfa5]">No spreadsheet reconciliation, no custodial payout account, and no silent allocation logic. The distribution rule and every claim live on Arc.</p></div><div className="mt-10 grid gap-px overflow-hidden rounded-[28px] border border-[#684630] bg-[#684630] md:grid-cols-3">{[
        ['01', 'Create a split', 'Set 2–12 recipient wallets and exact percentage shares. The factory deploys an immutable vault.'],
        ['02', 'Fund once', 'Approve the vault for your USDC amount, then deposit. The contract allocates claimable balances immediately.'],
        ['03', 'Members claim', 'Each member signs a claim from their own wallet. There is no platform withdrawal queue.'],
      ].map(([num, title, body]) => <div key={num} className="bg-[#301b11] p-7"><span className="mono text-xs text-[#e6a86b]">{num}</span><h3 className="mt-6 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-[#d8bda3]">{body}</p></div>)}</div></div></section>

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><div><Chip tone="green"><ShieldCheck className="size-3" />Non-custodial by design</Chip><h2 className="mt-5 font-serif text-4xl leading-tight">A financial workflow that never takes your keys.</h2></div><div className="grid gap-4 sm:grid-cols-2"><Feature icon={<WalletCards />} title="Wallet-native" text="MetaMask, OKX Wallet, and other EIP-6963 providers can connect directly." /><Feature icon={<CircleDollarSign />} title="USDC-first" text="Uses Arc’s ERC-20 USDC interface with 6-decimal accounting for approvals and transfers." /><Feature icon={<Network />} title="Arc-aware" text="Detects and requests Arc Testnet switching before any signed contract operation." /><Feature icon={<ReceiptText />} title="Auditable state" text="Creation, funding, and claims each return a wallet-signed transaction hash." /></div></div></section>
    </> : <section className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2"><Chip tone="green"><span className="size-1.5 rounded-full bg-emerald-500" />Arc Testnet</Chip>{!isFactoryConfigured && <Chip>Deployment setup required</Chip>}</div><h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">Distribution terminal</h1><p className="mt-1 text-sm text-stone-500">Create a split, fund it with USDC, and watch claimable balances settle onchain.</p></div><div className="flex items-center gap-2"><IconButton label="Refresh dashboard" onClick={() => { if (session?.address) { refreshBalance(); refreshVaults(); refreshVault() } }}><RefreshCw className={cn('size-4', busy === 'refresh' && 'animate-spin')} /></IconButton>{session ? <button onClick={() => navigator.clipboard.writeText(session.address)} className="mono inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-xs font-medium text-stone-700 hover:border-orange-300"><span className={cn('size-2 rounded-full', onArc ? 'bg-emerald-500' : 'bg-orange-500')} />{shortAddress(session.address)}<Copy className="size-3 text-stone-400" /></button> : <button onClick={() => setWalletOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#301b11] px-4 py-3 text-sm font-bold text-[#ffddb0]"><WalletCards className="size-4" />Connect wallet</button>}</div></div>

      {notice && <div className={cn('mb-6 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm', notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-orange-200 bg-orange-50 text-orange-800')}><p>{notice.message}</p><button onClick={() => setNotice(null)} className="shrink-0 text-current/60 hover:text-current"><X className="size-4" /></button></div>}
      {!session && <div className="mb-6 rounded-[24px] border border-orange-200 bg-gradient-to-r from-orange-50 to-[#fff7eb] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#4b2715]">Connect an EVM wallet to start.</p><p className="mt-1 text-sm text-stone-600">ArcSplit uses the connected account for all contract calls. Your private key never leaves your wallet.</p></div><button onClick={() => setWalletOpen(true)} className="shrink-0 rounded-xl bg-[#301b11] px-4 py-2.5 text-sm font-bold text-[#ffddb0]">Select wallet</button></div></div>}
      {session && !onArc && <div className="mb-6 rounded-[24px] border border-orange-200 bg-orange-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-orange-900">Switch to Arc Testnet before continuing.</p><p className="mt-1 text-sm text-orange-800/80">The app detects your current chain and requests the official Arc Testnet configuration from your wallet.</p></div><button onClick={handleSwitch} disabled={busy === 'switch'} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white"><Network className="size-4" />{busy === 'switch' ? 'Switching…' : 'Switch network'}</button></div></div>}
      {!isFactoryConfigured && <div className="mb-6 rounded-[24px] border border-dashed border-stone-300 bg-white/70 p-5"><p className="font-semibold text-[#4b2715]">Deploy the contract before creating live splits.</p><p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">This starter keeps the factory address out of source control. Deploy <span className="mono text-xs">contracts/src/ArcSplitFactory.sol</span> to Arc Testnet, copy its address into <span className="mono text-xs">.env</span> as <span className="mono text-xs">VITE_ARC_SPLIT_FACTORY_ADDRESS</span>, then restart the app. The UI will not imitate contract actions without a deployed factory.</p></div>}

      <div className="grid gap-5 lg:grid-cols-[1.28fr_.72fr]">
        <div className="rounded-[28px] border border-stone-200 bg-[#fffdf8]/95 shadow-[0_20px_60px_rgba(86,48,20,.08)]"><div className="border-b border-stone-200 px-5 pt-5"><div className="flex gap-6"><TabButton selected={tab === 'create'} onClick={() => setTab('create')} icon={<Plus className="size-4" />} label="Create split" /><TabButton selected={tab === 'settle'} onClick={() => setTab('settle')} icon={<Gauge className="size-4" />} label="Fund & settle" /></div></div>
          <div className="p-5 sm:p-6"><AnimatePresence mode="wait">{tab === 'create' ? <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><div className="flex items-start justify-between gap-4"><div><h2 className="font-serif text-2xl font-semibold">Create a distribution rule</h2><p className="mt-1 text-sm leading-6 text-stone-500">Each recipient and percentage is written into a dedicated ArcSplit vault. The allocation becomes immutable after creation.</p></div><span className={cn('rounded-xl px-2.5 py-2 text-xs font-bold', Math.abs(totalShare - 100) < 0.001 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700')}>{totalShare.toFixed(2)}% / 100%</span></div>
            <div className="mt-6 space-y-3">{recipients.map((row, index) => <div key={index} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_132px_40px] sm:items-center"><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Recipient {index + 1}</label><input value={row.address} onChange={(event) => updateRecipient(index, 'address', event.target.value)} placeholder="0x… wallet address" className="mono w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-300" /></div><div className="border-t border-stone-100 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0"><label className="mb-1 block text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Share</label><div className="flex items-center"><input value={row.share} onChange={(event) => updateRecipient(index, 'share', event.target.value)} type="number" min="0" max="100" step="0.01" className="w-full bg-transparent text-sm font-semibold text-stone-800 outline-none" /><span className="text-sm text-stone-400">%</span></div></div><button disabled={recipients.length <= 2} onClick={() => setRecipients((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="grid size-9 place-items-center rounded-xl text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="size-4" /></button></div>)}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button disabled={recipients.length >= 12} onClick={() => setRecipients((current) => [...current, { address: '', share: '' }])} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-orange-300 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-40"><Plus className="size-3.5" />Add participant</button><p className="text-xs text-stone-500">2–12 wallets · shares must total exactly 100%</p></div>
            <button onClick={handleCreate} disabled={!canCreate} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#301b11] px-5 py-4 text-sm font-bold text-[#ffddb0] shadow-[0_12px_28px_rgba(72,34,11,.18)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Split className="size-4" />}{busy === 'create' ? 'Confirming on Arc…' : !session ? 'Connect wallet to create' : !onArc ? 'Switch to Arc Testnet' : !isFactoryConfigured ? 'Deploy factory first' : 'Create immutable split'}</button>
          </motion.div> : <motion.div key="settle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold">Fund and settle</h2><p className="mt-1 text-sm leading-6 text-stone-500">A deposit immediately records each recipient’s claimable USDC balance in the selected vault.</p></div>{vaults.length > 0 && <select value={activeVault ?? ''} onChange={(event) => useVault(event.target.value)} className="mono max-w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs outline-none"><option value="">Select a vault</option>{vaults.map((vault) => <option key={vault} value={vault}>{shortAddress(vault, 6)}</option>)}</select>}</div>
            {!activeVault ? <div className="mt-7 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-7 text-center"><Split className="mx-auto size-6 text-stone-400" /><p className="mt-3 font-semibold text-stone-700">No split vault selected</p><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-stone-500">Create your first split rule, or paste a deployed ArcSplit vault address below to inspect and use it.</p><div className="mx-auto mt-4 flex max-w-sm gap-2"><input placeholder="0x… vault address" onKeyDown={(event) => { if (event.key === 'Enter') useVault(event.currentTarget.value) }} className="mono min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400" /><button onClick={(event) => { const input = event.currentTarget.previousElementSibling as HTMLInputElement; useVault(input.value) }} className="rounded-xl bg-[#301b11] px-3 text-xs font-bold text-[#ffddb0]">Open</button></div></div> : <><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric icon={<CircleDollarSign className="size-4" />} label="Vault funded" value={`${formatUsdc(vaultData?.totalDeposited)} USDC`} /><Metric icon={<WalletCards className="size-4" />} label="Your wallet" value={`${formatUsdc(balance)} USDC`} /><Metric icon={<BadgeCheck className="size-4" />} label="Your claimable" value={`${formatUsdc(vaultData?.claimable)} USDC`} /></div>
              <div className="mt-5 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-[#fff8ee] p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#4b2715]">Fund this split</span><span className="mono text-xs text-orange-700">USDC · 6 decimals</span></div><div className="mt-3 flex gap-2 rounded-xl border border-orange-200 bg-white p-1.5"><input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} type="number" min="0" step="0.01" className="min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#3a2114] outline-none" /><button onClick={handleFund} disabled={!canFund} className="rounded-lg bg-orange-700 px-4 text-sm font-bold text-white transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-45">{busy === 'fund' ? <Loader2 className="size-4 animate-spin" /> : 'Approve & fund'}</button></div><p className="mt-3 text-xs leading-5 text-stone-600">When allowance is insufficient, ArcSplit requests an exact USDC approval first. It then prompts a separate onchain deposit transaction.</p></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-[1.1fr_.9fr]"><div className="rounded-2xl border border-stone-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-stone-800">Allocation map</span><a href={explorerAddress(activeVault)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">View vault <ExternalLink className="size-3" /></a></div><div className="mt-4 space-y-3">{allocationRows.map((row) => <div key={row.address}><div className="flex items-center justify-between gap-3 text-xs"><span className="mono truncate text-stone-600">{shortAddress(row.address, 6)}</span><span className="font-semibold text-stone-800">{(row.bps / 100).toFixed(2)}% · {formatUsdc(row.value)} USDC</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-[#d66630] to-[#f5bf76]" style={{ width: `${row.bps / 100}%` }} /></div></div>)}</div></div><div className="rounded-2xl border border-stone-200 bg-[#fff9f1] p-4"><span className="text-sm font-semibold text-stone-800">Claim your balance</span><p className="mt-2 text-sm leading-6 text-stone-500">Anyone listed as a recipient can call claim from their own wallet.</p><p className="mt-4 font-serif text-3xl font-semibold text-[#422114]">{formatUsdc(vaultData?.claimable)} <span className="text-base text-stone-500">USDC</span></p><button onClick={handleClaim} disabled={busy === 'claim' || !vaultData?.claimable || vaultData.claimable <= 0n} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#301b11] px-4 py-3 text-sm font-bold text-[#ffddb0] disabled:cursor-not-allowed disabled:opacity-40">{busy === 'claim' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}Claim available USDC</button></div></div></>}
          </motion.div>}</AnimatePresence></div>
        </div>
        <aside className="space-y-5"><div className="rounded-[28px] border border-stone-200 bg-[#301b11] p-5 text-[#fff1dc] shadow-[0_20px_60px_rgba(86,48,20,.14)]"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Settlement integrity</span><ShieldCheck className="size-5 text-[#f0b96e]" /></div><div className="mt-5 space-y-4"><Integrity title="User-signed flows" text="Wallet signs creation, approval, deposit, and claims." /><Integrity title="Immutable split rules" text="Recipient addresses and basis-point shares cannot be edited after deployment." /><Integrity title="No platform account" text="The app cannot move vault funds or recover your wallet access." /></div></div><div className="rounded-[28px] border border-stone-200 bg-white/90 p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-stone-800">Onchain activity</p><p className="mt-1 text-xs text-stone-500">Recent interactions in this session</p></div><button onClick={() => setActivities([])} className="text-xs font-semibold text-stone-400 hover:text-stone-700">Clear</button></div><div className="mt-5 space-y-4">{activities.length === 0 ? <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-6 text-center"><ReceiptText className="mx-auto size-5 text-stone-300" /><p className="mt-2 text-sm text-stone-500">Your signed activity will appear here.</p></div> : activities.map((item) => <div key={item.id} className="flex gap-3"><span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', item.state === 'success' ? 'bg-emerald-100 text-emerald-700' : item.state === 'error' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700')}>{item.state === 'pending' ? <Loader2 className="size-3 animate-spin" /> : item.state === 'success' ? <Check className="size-3" /> : <X className="size-3" />}</span><div className="min-w-0"><p className="text-xs font-semibold text-stone-800">{item.title}</p><p className="mt-0.5 text-xs leading-5 text-stone-500">{item.detail}</p><div className="mt-1"><TxLink hash={item.hash} /></div></div></div>)}</div></div></aside>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/65 px-4 py-3 text-xs text-stone-500"><span>Arc chain ID <span className="mono font-medium text-stone-700">{ARC_CHAIN_ID}</span> · USDC is used for Arc gas and application settlement.</span><a href={ARC_EXPLORER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-orange-700">Open ArcScan <ExternalLink className="size-3" /></a></div>
    </section>}

    <footer className="border-t border-stone-200 bg-[#fff8ee]/80"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-7 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between lg:px-8"><span>ArcSplit · Testnet-only financial prototype. Do not use with production funds.</span><span className="mono">ARC / USDC DISTRIBUTION</span></div></footer>
    <WalletDialog open={walletOpen} onOpenChange={setWalletOpen} wallets={wallets} onPick={handleConnect} busy={busy === 'connect'} />
  </main>
}

function Stat({ number, label }: { number: string; label: string }) { return <div className="rounded-2xl border border-orange-200/80 bg-white/60 p-3"><p className="font-serif text-2xl font-semibold text-[#3a2114]">{number}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-[.1em] text-stone-500">{label}</p></div> }
function FloatCard({ className, icon, label, value, dark = false }: { className: string; icon: ReactNode; label: string; value: string; dark?: boolean }) { return <div className={cn('absolute rounded-2xl border px-3.5 py-3 shadow-[0_14px_34px_rgba(110,61,20,.14)]', className, dark ? 'border-[#66422e] bg-[#3b2316] text-[#fff1dc]' : 'border-orange-200 bg-white/90 text-[#422114]')}><div className="flex items-center gap-2 text-xs font-semibold opacity-70">{icon}{label}</div><p className="mt-2 text-sm font-bold">{value}</p></div> }
function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-stone-200 bg-white/75 p-5"><div className="grid size-9 place-items-center rounded-xl bg-orange-100 text-orange-700">{icon}</div><p className="mt-4 font-semibold text-stone-900">{title}</p><p className="mt-1 text-sm leading-6 text-stone-500">{text}</p></div> }
function TabButton({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: ReactNode; label: string }) { return <button onClick={onClick} className={cn('relative inline-flex items-center gap-2 pb-4 text-sm font-semibold', selected ? 'text-[#3a2114]' : 'text-stone-400 hover:text-stone-700')}><span className={cn('grid size-7 place-items-center rounded-lg', selected ? 'bg-orange-100 text-orange-700' : 'bg-stone-100 text-stone-400')}>{icon}</span>{label}{selected && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-orange-600" />}</button> }
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-stone-200 bg-white p-3.5"><div className="flex items-center gap-2 text-xs text-stone-500"><span className="text-orange-700">{icon}</span>{label}</div><p className="mt-3 text-base font-bold text-[#3d2114]">{value}</p></div> }
function Integrity({ title, text }: { title: string; text: string }) { return <div className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#5b3823] text-[#f0b96e]"><Check className="size-3" /></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#d9bea3]">{text}</p></div></div> }
