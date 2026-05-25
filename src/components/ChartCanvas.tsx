'use client'
import { useEffect, useRef } from 'react'
import type { Candle } from '../hooks/useCandles'
import type { Bet } from '../hooks/useStore'

interface Props {
  candles: Candle[]
  currentCandle: Candle | null
  activeBet: Bet | null
  upPct: number
  smoothPrice: number
  rem: number
  dur: number
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 0) return
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

export default function ChartCanvas({ candles, currentCandle, activeBet, upPct, smoothPrice, rem, dur }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !currentCandle) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.parentElement!.clientWidth
    const H = 190
    canvas.width = W * dpr; canvas.height = H * dpr
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const displayC = { ...currentCandle, c: smoothPrice }
    displayC.h = Math.max(displayC.h, smoothPrice)
    displayC.l = Math.min(displayC.l, smoothPrice)
    const allC = [...candles, displayC]
    const prices = allC.flatMap(c => [c.h, c.l])
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const range = (maxP - minP) || minP * 0.01
    const pad = { t:14, b:14, l:4, r:68 }
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b
    ctx.clearRect(0, 0, W, H)
    const toY = (p: number) => pad.t + cH - ((p - minP) / range) * cH

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (cH/4)*i
      ctx.beginPath(); ctx.strokeStyle = '#1a2040'; ctx.lineWidth = 1; ctx.setLineDash([3,6])
      ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke(); ctx.setLineDash([])
      const pl = maxP - (range/4)*i
      ctx.fillStyle = '#364070'; ctx.font = '8px Space Mono'
      ctx.fillText('₹'+(pl>=100000?(pl/100000).toFixed(1)+'L':Math.round(pl/1000)+'K'), W-pad.r+4, y+3)
    }

    // Zone
    const zX = pad.l + cW * 0.82
    ctx.fillStyle = 'rgba(255,69,96,.03)'; ctx.fillRect(zX, pad.t, cW-(zX-pad.l), cH)
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,69,96,.2)'; ctx.setLineDash([3,4]); ctx.lineWidth = 1
    ctx.moveTo(zX,pad.t); ctx.lineTo(zX,pad.t+cH); ctx.stroke(); ctx.setLineDash([])

    // Entry line
    if (activeBet) {
      const eY = toY(activeBet.entryPrice)
      const isH = activeBet.dir === 'HIGHER'
      const lc = isH ? '#00d97e' : '#ff4560'
      ctx.beginPath(); ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.setLineDash([5,4])
      ctx.moveTo(pad.l,eY); ctx.lineTo(W-pad.r,eY); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = lc; roundRect(ctx, W-pad.r+2, eY-9, 64, 18, 4); ctx.fill()
      ctx.fillStyle = '#000'; ctx.font = 'bold 8px Space Mono'
      ctx.fillText('ENTRY '+(isH?'↗':'↘'), W-pad.r+4, eY+3)
    }

    // Candles
    const slotW = cW / allC.length
    const bW = Math.max(4, Math.min(11, slotW * 0.65))
    allC.forEach((c, i) => {
      const x = pad.l + slotW*i + slotW/2
      const isUp = c.c >= c.o
      const col = isUp ? '#00d97e' : '#ff4560'
      ctx.globalAlpha = c.done ? 1 : 0.85
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1.5
      ctx.moveTo(x,toY(c.h)); ctx.lineTo(x,toY(c.l)); ctx.stroke()
      const tp = toY(Math.max(c.o,c.c)), bt = toY(Math.min(c.o,c.c))
      ctx.fillStyle = col; roundRect(ctx, x-bW/2, tp, bW, Math.max(2,bt-tp), 2); ctx.fill()
      ctx.globalAlpha = 1
    })

    // Live price tag
    const lY = toY(smoothPrice)
    ctx.fillStyle = smoothPrice >= currentCandle.o ? '#065f3a' : '#7f1d1d'
    roundRect(ctx, W-pad.r+2, lY-10, 65, 20, 5); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px Space Mono'
    const dp = Math.round(smoothPrice)
    const ds = dp >= 100000 ? (dp/100000).toFixed(2)+'L' : Math.round(dp/1000)+'K'
    ctx.fillText('₹'+ds, W-pad.r+4, lY+4)

    // Timer bar
    const prog = Math.max(0, Math.min(1, rem/dur))
    ctx.fillStyle = '#1e2540'; roundRect(ctx, W-pad.r+2, pad.t+4, 65, 16, 4); ctx.fill()
    ctx.fillStyle = '#f5a623'; roundRect(ctx, W-pad.r+2, pad.t+4, 65*prog, 16, 4); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = '8px Space Mono'
    const s = Math.ceil(rem/1000)
    ctx.fillText(String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'), W-pad.r+14, pad.t+13)
  })

  return <canvas ref={canvasRef} className="chart-canvas" height={190} />
}
