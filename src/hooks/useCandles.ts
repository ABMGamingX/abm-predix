'use client'
import { useRef, useCallback } from 'react'
import { ASSET_BASE_PRICES } from './useStore'

export interface Candle { o: number; h: number; l: number; c: number; done: boolean }

const LS_KEY = (a: string, t: number) => `PX_C_${a}_${t}`

function randWalk(p: number, v: number): number {
  const base = ASSET_BASE_PRICES[Object.keys(ASSET_BASE_PRICES).find(k => Math.abs(ASSET_BASE_PRICES[k] - p) / p < 0.3) || 'BTC'] || p
  const pull = (base - p) * 0.00002
  return p + pull + (Math.random() - 0.495) * p * v
}

export function makeHistCandle(p: number): Candle {
  const v = 0.0015, o = p, c = randWalk(p, v)
  return { o, h: Math.max(o,c) + Math.random()*p*.0006, l: Math.min(o,c) - Math.random()*p*.0006, c, done: true }
}

export function useCandleEngine() {
  const candlesRef = useRef<Candle[]>([])
  const currentRef = useRef<Candle | null>(null)
  const openTimeRef = useRef<number>(0)

  const saveCandles = useCallback((asset: string, tf: number) => {
    try {
      localStorage.setItem(LS_KEY(asset, tf), JSON.stringify({
        candles: candlesRef.current.slice(-20),
        currentCandle: currentRef.current,
        candleOpenTime: openTimeRef.current,
        savedAt: Date.now(),
      }))
    } catch {}
  }, [])

  const loadCandles = useCallback((asset: string, tf: number, activeBet: unknown, resolveFn: (b: unknown, p: number, s: boolean) => void): boolean => {
    try {
      const raw = localStorage.getItem(LS_KEY(asset, tf))
      if (!raw) return false
      const data = JSON.parse(raw)
      const now = Date.now()
      const dur = tf * 60 * 1000
      const elapsed = now - data.candleOpenTime
      candlesRef.current = data.candles || []

      if (elapsed >= dur) {
        const closed = { ...data.currentCandle, done: true }
        candlesRef.current.push(closed)
        const missed = Math.floor((elapsed - dur) / dur)
        let lp = closed.c
        for (let i = 0; i < Math.min(missed, 10); i++) {
          const c = makeHistCandle(lp); candlesRef.current.push(c); lp = c.c
        }
        if (activeBet) resolveFn(activeBet, closed.c, true)
        if (candlesRef.current.length > 16) candlesRef.current = candlesRef.current.slice(-16)
        const p = candlesRef.current[candlesRef.current.length - 1].c
        openTimeRef.current = now - (elapsed % dur)
        currentRef.current = { o: p, h: p, l: p, c: p, done: false }
      } else {
        openTimeRef.current = data.candleOpenTime
        currentRef.current = { ...data.currentCandle, done: false }
        if (candlesRef.current.length > 16) candlesRef.current = candlesRef.current.slice(-16)
      }
      return true
    } catch { return false }
  }, [])

  const initCandles = useCallback((asset: string, tf: number, startPrice: number, activeBet: unknown, resolveFn: (b: unknown, p: number, s: boolean) => void) => {
    const loaded = loadCandles(asset, tf, activeBet, resolveFn)
    if (!loaded) {
      candlesRef.current = []
      let p = startPrice
      for (let i = 0; i < 14; i++) { const c = makeHistCandle(p); candlesRef.current.push(c); p = c.c }
      openTimeRef.current = Date.now()
      currentRef.current = { o: p, h: p, l: p, c: p, done: false }
    }
  }, [loadCandles])

  const tick = useCallback((asset: string, tf: number, v: number): number => {
    if (!currentRef.current) return 0
    const np = randWalk(currentRef.current.c, v)
    currentRef.current = { ...currentRef.current, c: np, h: Math.max(currentRef.current.h, np), l: Math.min(currentRef.current.l, np) }
    return np
  }, [])

  const closeCandle = useCallback((asset: string, tf: number): number => {
    if (!currentRef.current) return 0
    const closed = { ...currentRef.current, done: true }
    const closePrice = closed.c
    candlesRef.current.push(closed)
    if (candlesRef.current.length > 16) candlesRef.current.shift()
    const p = closePrice
    openTimeRef.current = Date.now()
    currentRef.current = { o: p, h: p, l: p, c: p, done: false }
    saveCandles(asset, tf)
    return closePrice
  }, [saveCandles])

  return { candlesRef, currentRef, openTimeRef, initCandles, tick, closeCandle, saveCandles }
}
