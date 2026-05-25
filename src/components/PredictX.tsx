'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore, ASSET_BASE_PRICES, type Bet } from '../hooks/useStore'
import { useCandleEngine, makeHistCandle } from '../hooks/useCandles'
import AuthScreen from './AuthScreen'
import PinScreen from './PinScreen'
import AppScreen from './AppScreen'
import Toast from './Toast'

export type Screen = 'auth' | 'pin' | 'app'
export type PinMode = 'setup' | 'confirm' | 'login'

export default function PredictX() {
  const [screen, setScreen] = useState<Screen>('auth')
  const [pinMode, setPinMode] = useState<PinMode>('setup')
  const { state, setState, auth, setAuth, resolveBet, placeBet } = useStore()
  const candle = useCandleEngine()
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const saveRef = useRef(0)
  const [price, setPrice] = useState(ASSET_BASE_PRICES.BTC)
  const [candleTick, setCandleTick] = useState(0)
  const [toast, setToast] = useState<{ msg: string; color: 'green' | 'amber' | 'red' } | null>(null)
  const [timeLeft, setTimeLeft] = useState(60)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const showToast = useCallback((color: 'green' | 'amber' | 'red', msg: string) => {
    setToast({ color, msg })
    setTimeout(() => setToast(null), 3800)
  }, [])

  // Check session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const session = sessionStorage.getItem('PX_SESSION')
    const savedAuth = localStorage.getItem('PX_AUTH')
    if (savedAuth && session === '1') {
      setScreen('app')
    } else if (savedAuth) {
      const a = JSON.parse(savedAuth)
      if (a?.pin) {
        setPinMode('login')
        setScreen('pin')
      }
    }
  }, [])

  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    const v = stateRef.current.timeframeMin === 1 ? 0.0006 : 0.0004
    tickRef.current = setInterval(() => {
      const s = stateRef.current
      const np = candle.tick(s.asset, s.timeframeMin, v)
      setPrice(np)
      setState(prev => ({ ...prev, assetPrices: { ...prev.assetPrices, [s.asset]: np } }))

      const now = Date.now()
      const dur = s.timeframeMin * 60 * 1000
      const elapsed = now - candle.openTimeRef.current
      const rem = Math.max(0, dur - elapsed)
      setTimeLeft(Math.ceil(rem / 1000))

      if (elapsed >= dur) {
        const closePrice = candle.closeCandle(s.asset, s.timeframeMin)
        if (s.activeBet) {
          const result = resolveBet(s.activeBet, closePrice, false)
          const won = s.activeBet.dir === 'HIGHER' ? closePrice > s.activeBet.entryPrice : closePrice < s.activeBet.entryPrice
          const ratio = s.activeBet.dir === 'HIGHER' ? (100 / s.upPct) * 0.92 : (100 / (100 - s.upPct)) * 0.92
          const pay = Math.round(s.activeBet.amt * ratio)
          if (won) showToast('green', `🏆 WON ₹${pay.toLocaleString('en-IN')}!`)
          else showToast('red', `✗ Lost ₹${s.activeBet.amt}`)
        }
        // Auto-repeat
        if (s.autoRepeat && s.pendingAutoBet && !s.activeBet) {
          const ab = s.pendingAutoBet
          setTimeout(() => {
            if (ab.amt <= stateRef.current.balance) {
              placeBet(ab.dir, candle.currentRef.current?.c || np)
              showToast('amber', `🔁 Auto-bet ₹${ab.amt} ${ab.dir} placed!`)
            }
          }, 800)
          setState(prev => ({ ...prev, pendingAutoBet: null }))
        }
      }
      setCandleTick(t => t + 1)
      saveRef.current++
      if (saveRef.current % 5 === 0) candle.saveCandles(s.asset, s.timeframeMin)
    }, 1000)
  }, [candle, setState, resolveBet, placeBet, showToast])

  const enterApp = useCallback(() => {
    sessionStorage.setItem('PX_SESSION', '1')
    setScreen('app')
    const s = stateRef.current
    candle.initCandles(s.asset, s.timeframeMin, ASSET_BASE_PRICES[s.asset], s.activeBet, (bet, cp, silent) => {
      resolveBet(bet as Bet, cp, silent)
      if (!silent) {
        const won = (bet as Bet).dir === 'HIGHER' ? cp > (bet as Bet).entryPrice : cp < (bet as Bet).entryPrice
        setTimeout(() => showToast(won ? 'green' : 'red', won ? '🏆 Bet resolved — WON!' : '✗ Bet resolved — Lost'), 1000)
      }
    })
    setPrice(candle.currentRef.current?.c || ASSET_BASE_PRICES[s.asset])
    startTick()
  }, [candle, resolveBet, startTick, showToast])

  const logout = useCallback(() => {
    if (!confirm('Sign out?')) return
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    sessionStorage.removeItem('PX_SESSION')
    setScreen('auth')
  }, [])

  const switchAsset = useCallback((asset: string) => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    candle.saveCandles(stateRef.current.asset, stateRef.current.timeframeMin)
    setState({ asset })
    // Small delay to let state update
    setTimeout(() => {
      const s = stateRef.current
      candle.initCandles(asset, s.timeframeMin, ASSET_BASE_PRICES[asset], s.activeBet, (bet, cp, silent) => resolveBet(bet as Bet, cp, silent))
      setPrice(candle.currentRef.current?.c || ASSET_BASE_PRICES[asset])
      startTick()
    }, 50)
  }, [candle, setState, resolveBet, startTick])

  const switchTimeframe = useCallback((mins: number) => {
    if (stateRef.current.timeframeMin === mins) return
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    candle.saveCandles(stateRef.current.asset, stateRef.current.timeframeMin)
    setState({ timeframeMin: mins })
    setTimeout(() => {
      const s = stateRef.current
      candle.initCandles(s.asset, mins, ASSET_BASE_PRICES[s.asset], s.activeBet, (bet, cp, silent) => resolveBet(bet as Bet, cp, silent))
      setPrice(candle.currentRef.current?.c || ASSET_BASE_PRICES[s.asset])
      startTick()
    }, 50)
  }, [candle, setState, resolveBet, startTick])

  return (
    <div className="shell">
      {screen === 'auth' && (
        <AuthScreen
          onRegisterComplete={(name, email) => {
            setAuth({ name, email, pin: null })
            setPinMode('setup')
            setScreen('pin')
          }}
          onLoginStart={(email) => {
            const saved = auth
            if (!saved || saved.email !== email) { showToast('red', '⚠ No account found. Please register.'); return }
            setPinMode('login')
            setScreen('pin')
          }}
          hasAccount={!!auth?.pin}
        />
      )}
      {screen === 'pin' && (
        <PinScreen
          mode={pinMode}
          userName={auth?.name || ''}
          onSetupComplete={(pin) => {
            setAuth({ ...auth!, pin })
            const saved = localStorage.getItem('PX_STATE')
            if (saved) setState(JSON.parse(saved))
            enterApp()
          }}
          onLoginComplete={(pin) => {
            if (pin !== auth?.pin) return false
            const saved = localStorage.getItem('PX_STATE')
            if (saved) setState(JSON.parse(saved))
            enterApp()
            return true
          }}
          showToast={showToast}
        />
      )}
      {screen === 'app' && (
        <AppScreen
          state={state}
          setState={setState}
          auth={auth}
          price={price}
          candleTick={candleTick}
          timeLeft={timeLeft}
          candlesRef={candle.candlesRef}
          currentCandleRef={candle.currentRef}
          onPlaceBet={(dir) => {
            const s = stateRef.current
            if (s.activeBet) { showToast('amber', '⏳ Wait for current bet to resolve'); return }
            if (s.betAmt > s.balance) { showToast('red', '⚠ Insufficient balance'); return }
            const rem = s.timeframeMin * 60 - timeLeft
            if (timeLeft < 30) { showToast('red', '⏰ Less than 30s left — wait for next candle'); return }
            placeBet(dir, candle.currentRef.current?.c || price)
            showToast('amber', `⏳ ₹${s.betAmt} ${dir} bet placed!`)
          }}
          onSwitchAsset={switchAsset}
          onSwitchTimeframe={switchTimeframe}
          onLogout={logout}
          showToast={showToast}
        />
      )}
      {toast && <Toast color={toast.color} msg={toast.msg} />}
    </div>
  )
}
