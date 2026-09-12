import * as Dialog from '@radix-ui/react-dialog'
import { Check, Loader2, Wallet } from 'lucide-react'
import type { BrowserWallet } from '../services/wallet'
import { cn } from '../lib/utils'

function FallbackLogo({ name }: { name: string }) {
  const key = name.toLowerCase()
  if (key.includes('metamask')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#E17726"/><path fill="#fff" d="M10 14l8-6 8 6-2.2 8.5H12.2L10 14zm8-4.2L13.4 14l.8 3.1h7.6l.8-3.1L18 9.8z"/></svg>
  }
  if (key.includes('okx') || key.includes('okex')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#000"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="#fff"/><rect x="20" y="8" width="8" height="8" rx="1.5" fill="#fff"/><rect x="8" y="20" width="8" height="8" rx="1.5" fill="#fff"/><rect x="20" y="20" width="8" height="8" rx="1.5" fill="#fff"/></svg>
  }
  if (key.includes('phantom')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#AB9FF2"/><ellipse cx="18" cy="19" rx="9" ry="10" fill="#fff"/><circle cx="14.5" cy="18" r="1.8" fill="#4B3F8F"/><circle cx="21.5" cy="18" r="1.8" fill="#4B3F8F"/></svg>
  }
  if (key.includes('binance')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#F3BA2F"/><path fill="#111" d="M18 8.5l3.2 3.2-3.2 3.2-3.2-3.2L18 8.5zm-6.4 6.4L15 18l-3.4 3.1-3.2-3.1 3.2-3.1zm12.8 0l3.2 3.1-3.2 3.1L21 18l3.4-3.1zM18 17.2l3.2 3.2-3.2 3.2-3.2-3.2 3.2-3.2zm0 7.4l3.2 3.2-3.2 3.2-3.2-3.2 3.2-3.2z"/></svg>
  }
  if (key.includes('rabby')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#8697FF"/><text x="18" y="24" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">R</text></svg>
  }
  if (key.includes('coinbase')) {
    return <svg viewBox="0 0 36 36" className="size-9 rounded-xl"><rect width="36" height="36" rx="10" fill="#0052FF"/><circle cx="18" cy="18" r="8" fill="none" stroke="#fff" strokeWidth="3"/><rect x="15" y="15" width="6" height="6" rx="1" fill="#fff"/></svg>
  }
  return <span className="grid size-9 place-items-center rounded-xl bg-[#3d2517] text-sm font-black text-[#ffd9a1]">{name.slice(0, 1).toUpperCase()}</span>
}

function WalletLogo({ wallet }: { wallet: BrowserWallet }) {
  const icon = wallet.info.icon
  if (icon) {
    return <img src={icon} alt="" width={36} height={36} className="size-9 rounded-xl border border-stone-200 bg-white object-cover" />
  }
  return <FallbackLogo name={`${wallet.info.rdns} ${wallet.info.name}`} />
}

export function WalletDialog({ open, onOpenChange, wallets, onPick, busy }: {
  open: boolean; onOpenChange: (value: boolean) => void; wallets: BrowserWallet[]; onPick: (wallet: BrowserWallet) => void; busy: boolean
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[#1e120c]/50 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-stone-200 bg-[#fffdf8] p-5 shadow-[0_28px_100px_rgba(58,33,15,.28)] outline-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title className="font-serif text-2xl font-semibold tracking-tight text-[#2d1a10]">Choose a wallet</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-6 text-stone-500">ArcSplit discovers compatible EVM wallets in your browser. You will sign every onchain action yourself.</Dialog.Description>
          </div>
          <div className="grid size-10 place-items-center rounded-2xl bg-orange-100 text-orange-700"><Wallet className="size-5" /></div>
        </div>
        <div className="mt-5 space-y-2">
          {wallets.map((wallet) => <button key={wallet.info.uuid} onClick={() => onPick(wallet)} disabled={busy} className={cn('flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition hover:border-orange-300 hover:bg-orange-50/50 disabled:opacity-60')}>
            <span className="flex items-center gap-3"><WalletLogo wallet={wallet} /><span><span className="block font-semibold text-stone-900">{wallet.info.name}</span><span className="block text-xs text-stone-500">Browser wallet</span></span></span>
            {busy ? <Loader2 className="size-4 animate-spin text-orange-600" /> : <Check className="size-4 text-stone-300" />}
          </button>)}
          {!wallets.length && <div className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">No EIP-6963 wallet was found. Install or unlock MetaMask, OKX Wallet, or another EVM wallet, then refresh this page.</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
