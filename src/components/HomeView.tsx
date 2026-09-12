import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, BadgeCheck, ChevronDown, CircleDollarSign, Flame, Network,
  ReceiptText, ShieldCheck, Sparkles, Split, UsersRound, WalletCards,
} from 'lucide-react'
import { cn } from '../lib/utils'

function Chip({ children, tone = 'warm' }: { children: ReactNode; tone?: 'warm' | 'green' | 'dark' }) {
  const toneClass = tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tone === 'dark' ? 'border-[#4a2a19] bg-[#301b11] text-[#ffddb0]' : 'border-orange-200 bg-orange-50 text-orange-700'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.12em]', toneClass)}>{children}</span>
}

function Stat({ number, label }: { number: string; label: string }) {
  return <div className="rounded-2xl border border-orange-200/80 bg-white/60 p-3"><p className="font-serif text-2xl font-semibold text-[#3a2114]">{number}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-[.1em] text-stone-500">{label}</p></div>
}

function FloatCard({ className, icon, label, value, dark = false }: { className: string; icon: ReactNode; label: string; value: string; dark?: boolean }) {
  return <div className={cn('absolute rounded-2xl border px-3.5 py-3 shadow-[0_14px_34px_rgba(110,61,20,.14)]', className, dark ? 'border-[#66422e] bg-[#3b2316] text-[#fff1dc]' : 'border-orange-200 bg-white/90 text-[#422114]')}><div className="flex items-center gap-2 text-xs font-semibold opacity-70">{icon}{label}</div><p className="mt-2 text-sm font-bold">{value}</p></div>
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white/75 p-5"><div className="grid size-9 place-items-center rounded-xl bg-orange-100 text-orange-700">{icon}</div><p className="mt-4 font-semibold text-stone-900">{title}</p><p className="mt-1 text-sm leading-6 text-stone-500">{text}</p></div>
}

export function HomeView({ onOpenTerminal }: { onOpenTerminal: () => void }) {
  return <>
    <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:pb-24 lg:pt-24">
      <div className="relative z-10 max-w-2xl">
        <Chip><Sparkles className="size-3" />Built for Arc Testnet</Chip>
        <h1 className="mt-6 font-serif text-5xl font-semibold leading-[.98] tracking-[-.045em] text-[#2d1a10] sm:text-6xl lg:text-7xl">One deposit.<br /><em className="font-serif text-[#c55322]">Every contribution</em><br />accounted for.</h1>
        <p className="mt-7 max-w-xl text-lg leading-8 text-stone-600">ArcSplit turns shared USDC revenue into transparent, programmable distribution. Create an immutable split rule, fund it once, and let each participant claim exactly what they earned.</p>
        <div className="mt-8 flex flex-wrap gap-3"><button onClick={onOpenTerminal} className="group inline-flex items-center gap-2 rounded-2xl bg-[#301b11] px-5 py-3.5 text-sm font-bold text-[#ffddb0] shadow-[0_14px_35px_rgba(73,36,12,.20)] transition hover:-translate-y-0.5">Launch distribution terminal <ArrowRight className="size-4 transition group-hover:translate-x-1" /></button><a href="#how-it-works" className="inline-flex items-center gap-2 rounded-2xl border border-stone-300 bg-white/70 px-5 py-3.5 text-sm font-bold text-stone-700 transition hover:border-orange-300 hover:bg-orange-50">See the mechanics <ChevronDown className="size-4" /></a></div>
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
  </>
}
