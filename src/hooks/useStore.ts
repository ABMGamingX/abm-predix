'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export interface Bet {
  id: number
  asset: string
  dir: 'HIGHER' | 'LOWER'
  amt: number
  entryPrice: number
  time: string
  date: string
  timeframe: string
  status: 'pending' | 'won' | 'lost'
  pnl: number
  closePrice: number | null
}

export interface Txn {
  type: 'deposit' | 'win' | 'withdraw' | 'bet'
  amt: number
  label: string
  time: string
  date: string
}

export interface AuthData {
  name: string
  email: string
  pin: string | null
}

export interface AppState {
  balance: number
  betAmt: number
  asset: string
  timeframeMin: number
  upPct: number
  totalDeposited: number
  totalBetAmt: number
  totalWon: number
  bets: Bet[]
  txns: Txn[]
  activeBet: Bet | null
  assetPrices: Record<string, number>
  autoRepeat: boolean
  maxBetLimit: number
  pendingAutoBet: { dir: 'HIGHER' | 'LOWER'; amt: number; asset: string } | null
}

const DEFAULT_STATE: AppState = {
  balance: 2450,
  betAmt: 120,
  asset: 'BTC',
  timeframeMin: 1,
  upPct: 57,
  totalDeposited: 0,
  totalBetAmt: 0,
  totalWon: 0,
  bets: [],
  txns: [],
  activeBet: null,
  assetPrices: { BTC: 8600000, ETH: 230000, GOLD: 92000 },
  autoRepeat: false,
  maxBetLimit: 1000,
  pendingAutoBet: null,
}

export const ASSET_BASE_PRICES: Record<string, number> = { BTC: 8600000, ETH: 230000, GOLD: 92000 }

function loadFromLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as T) }
  } catch { return fallback }
}

function saveToLS(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

export function useStore() {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE)
  const [auth, setAuthRaw] = useState<AuthData | null>(null)
  const stateRef = useRef(state)
  const authRef = useRef(auth)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { authRef.current = auth }, [auth])

  // Load from localStorage on mount
  useEffect(() => {
    const loadedState = loadFromLS<AppState>('PX_STATE', DEFAULT_STATE)
    const loadedAuth = loadFromLS<AuthData | null>('PX_AUTH', null)
    setStateRaw(loadedState)
    setAuthRaw(loadedAuth)
  }, [])

  const setState = useCallback((updater: Partial<AppState> | ((prev: AppState) => AppState)) => {
    setStateRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      saveToLS('PX_STATE', next)
      return next
    })
  }, [])

  const setAuth = useCallback((a: AuthData | null) => {
    setAuthRaw(a)
    saveToLS('PX_AUTH', a)
  }, [])

  const addTxn = useCallback((type: Txn['type'], amt: number, label: string) => {
    const txn: Txn = {
      type, amt, label,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-IN'),
    }
    setState(prev => ({ ...prev, txns: [txn, ...prev.txns] }))
  }, [setState])

  const resolveBet = useCallback((bet: Bet, closePrice: number, silent: boolean) => {
    setStateRaw(prev => {
      const won = bet.dir === 'HIGHER' ? closePrice > bet.entryPrice : closePrice < bet.entryPrice
      const updatedBets = prev.bets.map(b => {
        if (b.id !== bet.id) return b
        const ratio = bet.dir === 'HIGHER' ? (100 / prev.upPct) * 0.92 : (100 / (100 - prev.upPct)) * 0.92
        const pay = Math.round(bet.amt * ratio)
        return { ...b, closePrice: Math.round(closePrice), status: (won ? 'won' : 'lost') as 'won' | 'lost', pnl: won ? pay - bet.amt : -bet.amt }
      })
      const wonBet = updatedBets.find(b => b.id === bet.id)!
      let newBalance = prev.balance
      let newTotalWon = prev.totalWon
      const newTxns = [...prev.txns]
      if (won) {
        const ratio = bet.dir === 'HIGHER' ? (100 / prev.upPct) * 0.92 : (100 / (100 - prev.upPct)) * 0.92
        const pay = Math.round(bet.amt * ratio)
        newBalance += pay
        newTotalWon += pay
        newTxns.unshift({ type: 'win', amt: pay, label: `Won ${bet.asset} ${bet.dir} bet`, time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('en-IN') })
      }
      // Auto-repeat
      const pendingAutoBet = (prev.autoRepeat && prev.betAmt <= newBalance)
        ? { dir: bet.dir, amt: bet.amt, asset: bet.asset }
        : null
      const next: AppState = { ...prev, bets: updatedBets, activeBet: null, balance: newBalance, totalWon: newTotalWon, txns: newTxns, pendingAutoBet }
      saveToLS('PX_STATE', next)
      return next
    })
    return { won: bet.dir === 'HIGHER' ? closePrice > bet.entryPrice : closePrice < bet.entryPrice, silent }
  }, [])

  const placeBet = useCallback((dir: 'HIGHER' | 'LOWER', entryPrice: number) => {
    setStateRaw(prev => {
      const bet: Bet = {
        id: Date.now(), asset: prev.asset, dir, amt: prev.betAmt, entryPrice,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: new Date().toLocaleDateString('en-IN'),
        timeframe: prev.timeframeMin + '-MIN', status: 'pending', pnl: 0, closePrice: null,
      }
      const newTxns: Txn[] = [{ type: 'bet', amt: -prev.betAmt, label: `${prev.asset} ${dir} bet placed`, time: bet.time, date: bet.date }, ...prev.txns]
      const next = { ...prev, balance: prev.balance - prev.betAmt, totalBetAmt: prev.totalBetAmt + prev.betAmt, bets: [bet, ...prev.bets], activeBet: bet, txns: newTxns }
      saveToLS('PX_STATE', next)
      return next
    })
  }, [])

  return { state, setState, auth, setAuth, addTxn, resolveBet, placeBet, stateRef, authRef }
}
