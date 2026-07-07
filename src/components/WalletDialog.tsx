import * as Dialog from '@radix-ui/react-dialog'
import { Check, Loader2, Wallet } from 'lucide-react'
import type { BrowserWallet } from '../services/wallet'
import { cn } from '../lib/utils'

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
            <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-stone-100 text-stone-700"><Wallet className="size-4" /></span><span><span className="block font-semibold text-stone-900">{wallet.info.name}</span><span className="block text-xs text-stone-500">Browser wallet</span></span></span>
            {busy ? <Loader2 className="size-4 animate-spin text-orange-600" /> : <Check className="size-4 text-stone-300" />}
          </button>)}
          {!wallets.length && <div className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">No EIP-6963 wallet was found. Install or unlock MetaMask, OKX Wallet, or another EVM wallet, then refresh this page.</div>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
