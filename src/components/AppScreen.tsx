'use client'
import { useState, useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import type { AppState, AuthData, Bet } from '../hooks/useStore'
import type { Candle } from '../hooks/useCandles'
import ChartCanvas from './ChartCanvas'

const ASSETS = [
  { id: 'BTC', color: '#f5a623' },
  { id: 'ETH', color: '#818cf8' },
  { id: 'GOLD', color: '#facc15' },
]
const ASSET_POOLS: Record<string,string> = { BTC:'1,05,537', ETH:'38,210', GOLD:'71,450' }
const CRYPTO_ADDRS: Record<string,string> = {
  BTC: 'bc1qxy2kgdygjrsqtzq2n0yrf249q56l6wulm5w5lq',
  ETH: '0x742d35Cc6634C0532925a3b8D4C9B2E4e67f9d81',
  USDT: 'TRx9QzELpKkzq5HgWpCsRnvFzQV2AeXPx1',
  SOL: '7UX2i7SucgLMQcfZ75s3VXmZZY4YRUyJN9X1RgfMnhg',
}

interface Props {
  state: AppState
  setState: (u: Partial<AppState> | ((p: AppState) => AppState)) => void
  auth: AuthData | null
  price: number
  candleTick: number
  timeLeft: number
  candlesRef: RefObject<Candle[]>
  currentCandleRef: RefObject<Candle | null>
  onPlaceBet: (dir: 'HIGHER' | 'LOWER') => void
  onSwitchAsset: (asset: string) => void
  onSwitchTimeframe: (mins: number) => void
  onLogout: () => void
  showToast: (c: 'green'|'amber'|'red', m: string) => void
}

type Page = 'market' | 'bets' | 'wallet' | 'profile'
type Modal = 'none' | 'bet' | 'dep' | 'wd' | 'gear'

export default function AppScreen({ state, setState, auth, price, candleTick, timeLeft, candlesRef, currentCandleRef, onPlaceBet, onSwitchAsset, onSwitchTimeframe, onLogout, showToast }: Props) {
  const [page, setPage] = useState<Page>('market')
  const [modal, setModal] = useState<Modal>('none')
  const [betDir, setBetDir] = useState<'HIGHER'|'LOWER'>('HIGHER')
  const [betFilter, setBetFilter] = useState('all')
  const [selAsset, setSelAsset] = useState('')
  const [upiId, setUpiId] = useState('')
  const [depAmt, setDepAmt] = useState(500)
  const [wdUpi, setWdUpi] = useState('')
  const [wdAmt, setWdAmt] = useState('')
  const [wdStep, setWdStep] = useState(1)
  const [wdPin, setWdPin] = useState('')
  const [payTab, setPayTab] = useState<'upi'|'crypto'>('upi')
  const [cryptoSel, setCryptoSel] = useState('BTC')
  const [cryptoAmt, setCryptoAmt] = useState(50)
  const [upPct, setUpPct] = useState(state.upPct)
  const [smoothPrice, setSmoothPrice] = useState(price)
  const smoothRef = useRef(price)
  const rafRef = useRef<number>(0)

  // Smooth price lerp
  useEffect(() => {
    smoothRef.current = price
  }, [price])

  useEffect(() => {
    function lerp() {
      setSmoothPrice(p => {
        const target = smoothRef.current
        const next = p + (target - p) * 0.06
        return Math.abs(next - target) < 1 ? target : next
      })
      rafRef.current = requestAnimationFrame(lerp)
    }
    rafRef.current = requestAnimationFrame(lerp)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Pool distribution drift
  useEffect(() => {
    const t = setInterval(() => {
      setUpPct(p => Math.min(72, Math.max(33, p + (Math.random() > 0.5 ? 1 : -1))))
    }, 3000)
    return () => clearInterval(t)
  }, [])

  // Footer timestamps
  const [footerTimes, setFooterTimes] = useState<{h:string,m:string,dir:string}[]>([])
  useEffect(() => {
    const dur = state.timeframeMin * 60 * 1000
    const now = Date.now()
    const times = []
    for (let i = 4; i >= 0; i--) {
      const t = new Date(now - i * dur)
      const candles = candlesRef.current || []
      const c = candles[candles.length - 1 - (i > 0 ? i-1 : 0)]
      times.push({ h: t.getHours().toString().padStart(2,'0'), m: t.getMinutes().toString().padStart(2,'0'), dir: i === 0 ? 'flag' : (c ? (c.c >= c.o ? 'up' : 'dn') : 'up') })
    }
    setFooterTimes(times)
  }, [candleTick, state.timeframeMin, candlesRef])

  // P&L display
  const livePnl = state.activeBet ? (() => {
    const b = state.activeBet!
    const ratio = b.dir === 'HIGHER' ? (100/upPct)*0.92 : (100/(100-upPct))*0.92
    const pay = Math.round(b.amt * ratio)
    const winning = b.dir === 'HIGHER' ? smoothPrice > b.entryPrice : smoothPrice < b.entryPrice
    return winning ? pay - b.amt : -b.amt
  })() : 0

  const dur = state.timeframeMin * 60
  const rem = timeLeft
  const remMs = rem * 1000
  const durMs = dur * 1000

  // Filtered bets
  const filteredBets = state.bets.filter(b => {
    if (betFilter === 'all') return true
    if (betFilter === 'won') return b.status === 'won'
    if (betFilter === 'lost') return b.status === 'lost'
    if (betFilter === 'pending') return b.status === 'pending'
    return b.asset.toLowerCase() === betFilter
  })
  const totalBets = state.bets.length
  const wonBets = state.bets.filter(b => b.status === 'won').length
  const wr = totalBets > 0 ? Math.round(wonBets/totalBets*100)+'%' : '—'
  const pnl = state.bets.filter(b => b.status !== 'pending').reduce((a,b) => a+b.pnl, 0)

  function openBetModal(dir: 'HIGHER'|'LOWER') {
    if (state.betAmt > state.balance) { showToast('red','⚠ Insufficient balance'); return }
    if (state.activeBet) { showToast('amber','⏳ Wait for current bet to resolve'); return }
    setBetDir(dir); setModal('bet')
  }

  function confirmBet() {
    onPlaceBet(betDir)
    setModal('none')
  }

  function doDeposit() {
    if (!upiId.includes('@')) { showToast('red','⚠ Enter valid UPI ID'); return }
    if (depAmt < 10) { showToast('red','⚠ Min ₹10'); return }
    setState(p => ({ ...p, balance: p.balance+depAmt, totalDeposited: p.totalDeposited+depAmt, txns: [{ type:'deposit' as const, amt:depAmt, label:'UPI Deposit via '+upiId, time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), date:new Date().toLocaleDateString('en-IN') }, ...p.txns] }))
    setModal('none'); showToast('amber',`✓ ₹${depAmt.toLocaleString('en-IN')} added!`)
  }

  function doCryptoDeposit() {
    const inr = Math.round(cryptoAmt * 83.5)
    setState(p => ({ ...p, balance: p.balance+inr, totalDeposited: p.totalDeposited+inr, txns: [{ type:'deposit' as const, amt:inr, label:`${cryptoSel} Crypto Deposit ($${cryptoAmt})`, time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), date:new Date().toLocaleDateString('en-IN') }, ...p.txns] }))
    setModal('none'); showToast('amber',`✓ ₹${inr.toLocaleString('en-IN')} credited!`)
  }

  function doWithdraw() {
    const amt = parseInt(wdAmt)
    if (!wdUpi.includes('@')) { showToast('red','⚠ Invalid UPI ID'); return }
    if (!amt || amt < 100) { showToast('red','⚠ Min ₹100'); return }
    if (amt > state.balance) { showToast('red','⚠ Insufficient balance'); return }
    setState(p => ({ ...p, balance: p.balance-amt, txns: [{ type:'withdraw' as const, amt:-amt, label:'Withdrawal to '+wdUpi, time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}), date:new Date().toLocaleDateString('en-IN') }, ...p.txns] }))
    setModal('none'); setWdStep(1); setWdPin(''); showToast('amber',`↑ ₹${amt.toLocaleString('en-IN')} withdrawal initiated!`)
  }

  function handleWdPin(k: string) {
    if (wdPin.length >= 6) return
    const next = wdPin + k
    setWdPin(next)
    if (next.length === 6) {
      setTimeout(() => {
        if (next === (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('PX_AUTH')||'{}')?.pin : '')) {
          doWithdraw()
        } else {
          showToast('red','⚠ Wrong PIN'); setWdPin('')
        }
      }, 180)
    }
  }

  const bal = Math.round(state.balance).toLocaleString('en-IN')
  const ratio = betDir === 'HIGHER' ? (100/upPct)*0.92 : (100/(100-upPct))*0.92
  const payout = Math.round(state.betAmt * ratio)

  return (
    <div className="app-screen active">
      {/* Topbar */}
      <div className="topbar">
        <div className="logo">Predict<span>X</span></div>
        <div className="wchip" onClick={() => setModal('dep')}>
          <span style={{color:'var(--muted2)',fontSize:11}}>₹</span>
          <span className="bal">{bal}</span>
          <span className="plus">+</span>
        </div>
      </div>

      {/* MARKET PAGE */}
      <div className={`page ${page==='market'?'active':''}`}>
        {/* Asset tabs */}
        <div className="asset-tabs" style={{flexShrink:0}}>
          {ASSETS.map(a => (
            <div key={a.id} className={`atab ${state.asset===a.id?'active':''}`} onClick={() => onSwitchAsset(a.id)}>
              <span className="cdot" style={{background:a.color}} />{a.id}
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="mkt-hdr" style={{flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div className="mh-title">{state.asset}/INR</div>
            <div className="cur-price">₹{Math.round(price).toLocaleString('en-IN')}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="chart-wrap" style={{flexShrink:0}}>
          <div className="chart-hdr">
            <div className="chart-hdr-l">
              <div className="cbtn active">Candles</div>
            </div>
            <div className="ctimer-info">closes in <span className="ctimer-val">{String(Math.floor(rem/60)).padStart(2,'0')}:{String(rem%60).padStart(2,'0')}</span></div>
          </div>
          <ChartCanvas
            candles={candlesRef.current || []}
            currentCandle={currentCandleRef.current}
            activeBet={state.activeBet}
            upPct={upPct}
            smoothPrice={smoothPrice}
            rem={remMs}
            dur={durMs}
          />
          <div className="chart-footer">
            {footerTimes.map((t,i) => (
              <div key={i} className="ts-item">
                <div className={`ts-arrow ${t.dir}`}>{t.dir==='flag'?'⚑':t.dir==='up'?'↑':'↓'}</div>
                <div className="ts-time">{t.h}:{t.m}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeframe tabs */}
        <div className="time-tabs" style={{flexShrink:0}}>
          {[1,5].map(m => (
            <div key={m} className={`ttab ${state.timeframeMin===m?'active':''}`} onClick={() => onSwitchTimeframe(m)}>{m} min</div>
          ))}
        </div>

        {/* Distribution */}
        <div className="dist-card" style={{flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div>
              <div className="dist-title">Next Market Pool Distribution</div>
            </div>
          </div>
          <div className="dist-bar">
            <div className="dist-up" style={{flex:upPct}}>
              <div>↗ {upPct}%</div>
              <div className="dist-sub-txt">(₹{Math.round(105537*upPct/100).toLocaleString('en-IN')})</div>
            </div>
            <div className="dist-dn" style={{flex:100-upPct}}>
              <div className="dist-sub-txt">(₹{Math.round(105537*(100-upPct)/100).toLocaleString('en-IN')})</div>
              <div>{100-upPct}% ↘</div>
            </div>
          </div>
        </div>

        {/* Active bet banner */}
        {state.activeBet && (
          <div className="active-bet-banner" style={{flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div className="abb-dot" />
              <div>
                <div className="abb-txt">{state.activeBet.dir==='HIGHER'?'↗ HIGHER':'↘ LOWER'} bet active on {state.activeBet.asset}</div>
                <div className="abb-sub">
                  Entry ₹{Math.round(state.activeBet.entryPrice).toLocaleString('en-IN')} ·{' '}
                  <span style={{color:livePnl>=0?'var(--up)':'var(--dn)',fontWeight:700}}>
                    {livePnl>=0?'+':''}₹{Math.abs(livePnl).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
            <div className="abb-timer">{String(Math.floor(rem/60)).padStart(2,'0')}:{String(rem%60).padStart(2,'0')}</div>
          </div>
        )}

        {/* Bet card */}
        <div className="bet-card" style={{flexShrink:0}}>
          <div className="bet-lbl">Next Market Bet (₹)</div>
          <div className="bet-row">
            <div className="bctrl" onClick={() => setState(p=>({...p,betAmt:Math.max(10,p.betAmt-50)}))}>−</div>
            <div className="bnum">₹{state.betAmt}</div>
            <div className="bctrl" onClick={() => setState(p=>({...p,betAmt:p.betAmt+50}))}>+</div>
            <div className="bgear" onClick={() => setModal('gear')}>⚙</div>
          </div>
          <div className="quick-row">
            {[50,120,250,500,1000].map(v => (
              <div key={v} className={`qbtn ${state.betAmt===v?'active':''}`} onClick={() => setState({betAmt:v})}>
                {v>=1000?'₹1K':`₹${v}`}
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:10,marginTop:14}}>
            <button className="btn-H" id="btnH" disabled={!!state.activeBet} onClick={() => openBetModal('HIGHER')}>↗ HIGHER</button>
            <button className="btn-L" id="btnL" disabled={!!state.activeBet} onClick={() => openBetModal('LOWER')}>↘ LOWER</button>
          </div>
        </div>
        <div style={{height:16}} />
      </div>

      {/* MY BETS PAGE */}
      <div className={`page ${page==='bets'?'active':''}`}>
        <div className="page-hdr"><div className="page-title">My Bets</div><div className="page-sub">Your complete prediction history</div></div>
        <div className="filter-row">
          {['all','won','lost','pending','btc','eth','gold'].map(f => (
            <div key={f} className={`fchip ${betFilter===f?'active':''}`} onClick={() => setBetFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</div>
          ))}
        </div>
        <div className="stats-bar" style={{flexShrink:0}}>
          <div className="stat-seg"><div className="ss-lbl">TOTAL BETS</div><div className="ss-val">{totalBets}</div></div>
          <div className="stat-seg"><div className="ss-lbl">WIN RATE</div><div className="ss-val a">{wr}</div></div>
          <div className="stat-seg"><div className="ss-lbl">NET P&L</div><div className={`ss-val ${pnl>=0?'g':'r'}`}>{pnl>=0?'+':''}₹{Math.abs(pnl).toLocaleString('en-IN')}</div></div>
        </div>
        <div className="bets-list">
          {filteredBets.length === 0
            ? <div style={{textAlign:'center',padding:'40px 0',color:'var(--muted2)',fontFamily:'var(--font-mono)',fontSize:12}}>No bets in this filter 🎯</div>
            : filteredBets.map(b => {
                const pd = b.closePrice ? b.closePrice - Math.round(b.entryPrice) : null
                return (
                  <div key={b.id} className="bet-item">
                    <div className="bi-top">
                      <div><div className="bi-asset">{b.asset}/INR</div><div className="bi-time">{b.date} · {b.time} · {b.timeframe}</div></div>
                      <div className={`bi-dir ${b.dir==='HIGHER'?'up':'dn'}`}>{b.dir==='HIGHER'?'↗':'↘'} {b.dir}</div>
                    </div>
                    <div className="bi-stats">
                      <div className="bi-stat"><div className="bi-sl">BET</div><div className="bi-sv">₹{b.amt}</div></div>
                      <div className="bi-stat"><div className="bi-sl">ENTRY</div><div className="bi-sv">₹{Math.round(b.entryPrice).toLocaleString('en-IN')}</div></div>
                      <div className="bi-stat"><div className="bi-sl">NEED</div><div className="bi-sv">{b.dir==='HIGHER'?'↑ ABOVE':'↓ BELOW'}</div></div>
                    </div>
                    {b.status==='pending' && <div className="bi-result pending">⏳ Pending — resolves at candle close</div>}
                    {b.status==='won' && <div className="bi-result won">🏆 Won! +₹{b.pnl.toLocaleString('en-IN')} | Exit ₹{(b.closePrice||0).toLocaleString('en-IN')} ({pd!==null?(pd>=0?'+':'')+pd.toLocaleString('en-IN'):''})</div>}
                    {b.status==='lost' && <div className="bi-result lost">✗ Lost ₹{Math.abs(b.pnl).toLocaleString('en-IN')} | Exit ₹{(b.closePrice||0).toLocaleString('en-IN')} ({pd!==null?pd.toLocaleString('en-IN'):''})</div>}
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* WALLET PAGE */}
      <div className={`page ${page==='wallet'?'active':''}`}>
        <div className="page-hdr"><div className="page-title">Wallet</div><div className="page-sub">Manage your funds</div></div>
        <div className="wallet-hero">
          <div className="wh-lbl">TOTAL BALANCE</div>
          <div className="wh-bal"><span>₹</span>{bal}</div>
          <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted2)',marginTop:4}}>Available to bet</div>
          <div className="wh-actions">
            <div className="wh-btn dep" onClick={() => setModal('dep')}>⚡ Add Money</div>
            <div className="wh-btn wd" onClick={() => { setWdStep(1); setWdPin(''); setModal('wd') }}>↑ Withdraw</div>
          </div>
        </div>
        <div className="wallet-stats">
          <div className="ws-card"><div className="ws-icon">🏆</div><div className="ws-lbl">TOTAL WON</div><div className="ws-val">₹{state.totalWon.toLocaleString('en-IN')}</div></div>
          <div className="ws-card"><div className="ws-icon">📊</div><div className="ws-lbl">TOTAL BET</div><div className="ws-val">₹{state.totalBetAmt.toLocaleString('en-IN')}</div></div>
          <div className="ws-card"><div className="ws-icon">💸</div><div className="ws-lbl">DEPOSITED</div><div className="ws-val">₹{state.totalDeposited.toLocaleString('en-IN')}</div></div>
        </div>
        <div className="txn-section">
          <div className="txn-title">Transaction History</div>
          {state.txns.length === 0
            ? <div style={{textAlign:'center',padding:'30px 0',color:'var(--muted2)',fontFamily:'var(--font-mono)',fontSize:11}}>No transactions yet</div>
            : state.txns.map((t,i) => (
              <div key={i} className="txn-item">
                <div className={`txn-ico ${t.type==='deposit'||t.type==='win'?'d':t.type==='withdraw'?'w':'b'}`}>{t.type==='deposit'?'💳':t.type==='win'?'🏆':t.type==='withdraw'?'↑':'🎯'}</div>
                <div className="txn-info"><div className="txn-name">{t.label}</div><div className="txn-date">{t.date} · {t.time}</div></div>
                <div className={`txn-amt ${t.amt>0?'pos':'neg'}`}>{t.amt>0?'+':''}₹{Math.abs(t.amt).toLocaleString('en-IN')}</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* PROFILE PAGE */}
      <div className={`page ${page==='profile'?'active':''}`}>
        <div className="page-hdr"><div className="page-title">Profile</div><div className="page-sub">Your account</div></div>
        <div className="profile-hero">
          <div className="avatar">{auth?.name?.charAt(0).toUpperCase()||'U'}</div>
          <div>
            <div className="p-name">{auth?.name||'User'}</div>
            <div className="p-id">{auth?.email||''}</div>
            <div className="p-badge">🏅 Pro Trader</div>
          </div>
        </div>
        <div className="profile-grid">
          <div className="pg-card"><div className="pg-lbl">BETS PLACED</div><div className="pg-val">{totalBets}</div><div className="pg-sub">lifetime</div></div>
          <div className="pg-card"><div className="pg-lbl">WIN RATE</div><div className={`pg-val ${pnl>=0?'g':''}`}>{wr}</div><div className="pg-sub">overall</div></div>
          <div className="pg-card"><div className="pg-lbl">NET P&L</div><div className={`pg-val ${pnl>=0?'g':'r'}`}>{pnl>=0?'+':''}₹{Math.abs(pnl).toLocaleString('en-IN')}</div><div className="pg-sub">all time</div></div>
          <div className="pg-card"><div className="pg-lbl">RANK</div><div className="pg-val a">#—</div><div className="pg-sub">leaderboard</div></div>
        </div>
        <div className="setting-section">
          <div className="sg-title" style={{marginBottom:7}}>Account</div>
          <div className="sg-item"><div className="sg-left"><span className="sg-ico">🔐</span><span className="sg-name">Change PIN</span></div><span style={{color:'var(--muted)'}}>›</span></div>
          <div className="sg-item"><div className="sg-left"><span className="sg-ico">📱</span><span className="sg-name">Linked UPI IDs</span></div><span style={{color:'var(--muted)'}}>›</span></div>
          <div className="sg-title" style={{margin:'12px 0 7px'}}>Preferences</div>
          <div className="sg-item">
            <div className="sg-left"><span className="sg-ico">🔁</span><span className="sg-name">Auto-repeat Bet</span></div>
            <div className={`toggle ${state.autoRepeat?'on':''}`} onClick={() => setState({autoRepeat:!state.autoRepeat})}><div className="tknob" /></div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>⬤ Sign Out</button>
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {(['market','bets','wallet','profile'] as Page[]).map(p => (
          <div key={p} className={`nav-btn ${page===p?'active':''}`} onClick={() => setPage(p)}>
            <span className="nav-icon">{p==='market'?'📊':p==='bets'?'📋':p==='wallet'?'💳':'👤'}</span>
            {p.charAt(0).toUpperCase()+p.slice(1)}
          </div>
        ))}
      </div>

      {/* BET CONFIRM MODAL */}
      {modal === 'bet' && (
        <div className="overlay open" onClick={e => e.target===e.currentTarget&&setModal('none')}>
          <div className="modal">
            <div className="m-handle" />
            <div className="m-close" onClick={() => setModal('none')}>✕</div>
            <div className="m-title">Confirm Bet</div>
            <div className="m-sub">Bet resolves at end of current candle</div>
            <div className="bcbox">
              <div className="bcrow"><span className="bc-lbl">ASSET</span><span className="bc-val">{state.asset}/INR</span></div>
              <div className="bcrow"><span className="bc-lbl">TIMEFRAME</span><span className="bc-val">{state.timeframeMin}-MINUTE</span></div>
              <div className="bcrow"><span className="bc-lbl">ENTRY PRICE</span><span className="bc-val">₹{Math.round(price).toLocaleString('en-IN')}</span></div>
              <div className="divider" />
              <div className="bcrow"><span className="bc-lbl">YOUR PREDICTION</span><span className={`bc-dir ${betDir==='HIGHER'?'up':'dn'}`}>{betDir==='HIGHER'?'↗ HIGHER':'↘ LOWER'}</span></div>
              <div className="bcrow" style={{justifyContent:'center',marginTop:6}}><span className="bc-amt">₹{state.betAmt}</span></div>
            </div>
            <div className="pot-win">
              <div><div className="pw-lbl">POTENTIAL PAYOUT</div><div style={{fontSize:9,color:'var(--muted)',fontFamily:'var(--font-mono)',marginTop:2}}>based on current pool ratio</div></div>
              <div className="pw-val">₹{payout.toLocaleString('en-IN')}</div>
            </div>
            <div className="resolves-note">✓ Win condition: price must be <span>{betDir==='HIGHER'?'ABOVE':'BELOW'} entry</span> at candle close</div>
            <button className={`conf-btn ${betDir==='HIGHER'?'up':'dn'}`} onClick={confirmBet}>Confirm {betDir==='HIGHER'?'↗ HIGHER':'↘ LOWER'} — ₹{state.betAmt}</button>
            <div className="cancel-lnk" onClick={() => setModal('none')}>Cancel</div>
          </div>
        </div>
      )}

      {/* DEPOSIT MODAL */}
      {modal === 'dep' && (
        <div className="overlay open" onClick={e => e.target===e.currentTarget&&setModal('none')}>
          <div className="modal">
            <div className="m-handle" />
            <div className="m-close" onClick={() => setModal('none')}>✕</div>
            <div className="m-title">Add Money 💸</div>
            <div className="m-sub">Instant · Zero fees · Choose your method</div>
            <div className="pay-tabs">
              <div className={`pay-tab ${payTab==='upi'?'active':''}`} onClick={() => setPayTab('upi')}>🇮🇳 UPI</div>
              <div className={`pay-tab ${payTab==='crypto'?'active':''}`} onClick={() => setPayTab('crypto')}>₿ Crypto</div>
            </div>
            {payTab === 'upi' && (
              <div>
                <div className="upi-apps">
                  {[{n:'GPay',bg:'#1a73e8'},{n:'PhPe',bg:'#5f259f'},{n:'Paytm',bg:'#00baf2'},{n:'BHIM',bg:'#ff6600'}].map(a => (
                    <div key={a.n} className="upi-app" onClick={e => {document.querySelectorAll('.upi-app').forEach(x=>x.classList.remove('sel'));(e.currentTarget as HTMLElement).classList.add('sel')}}>
                      <div className="upi-logo" style={{background:a.bg}}>{a.n}</div>
                      <div className="upi-name">{a.n}</div>
                    </div>
                  ))}
                </div>
                <label className="flbl">UPI ID</label>
                <input className="ifield" type="text" placeholder="yourname@upi" value={upiId} onChange={e => setUpiId(e.target.value)} />
                <label className="flbl" style={{marginTop:10}}>Amount (₹)</label>
                <input className="ifield" type="number" value={depAmt} onChange={e => setDepAmt(parseInt(e.target.value)||0)} />
                <div className="chip-row">
                  {[100,250,500,1000,2000,5000].map(v => (
                    <div key={v} className={`chip ${depAmt===v?'active':''}`} onClick={() => setDepAmt(v)}>₹{v>=1000?v/1000+'K':v}</div>
                  ))}
                </div>
                <button className="pay-btn" onClick={doDeposit}>⚡ Pay via UPI</button>
                <div className="secure-note">🔒 256-bit encrypted · RBI regulated · Instant credit</div>
              </div>
            )}
            {payTab === 'crypto' && (
              <div>
                <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--muted2)',letterSpacing:'.8px',textTransform:'uppercase',marginBottom:10}}>Select Cryptocurrency</div>
                <div className="crypto-grid">
                  {[{s:'BTC',n:'Bitcoin',net:'BEP20',ico:'₿',bg:'#f7931a22'},{s:'ETH',n:'Ethereum',net:'ERC20',ico:'Ξ',bg:'#627eea22'},{s:'USDT',n:'Tether',net:'TRC20',ico:'₮',bg:'#26a17b22'},{s:'SOL',n:'Solana',net:'Native',ico:'◎',bg:'#9945ff22'}].map(c => (
                    <div key={c.s} className={`crypto-item ${cryptoSel===c.s?'sel':''}`} onClick={() => setCryptoSel(c.s)}>
                      <div className="crypto-ico" style={{background:c.bg}}>{c.ico}</div>
                      <div><div className="crypto-name">{c.n}</div><div className="crypto-net">{c.s} · {c.net}</div></div>
                    </div>
                  ))}
                </div>
                <div style={{background:'var(--card2)',border:'1px solid var(--border)',borderRadius:12,padding:14,marginBottom:14}}>
                  <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'var(--muted2)',letterSpacing:'.8px',marginBottom:6}}>DEPOSIT ADDRESS ({cryptoSel})</div>
                  <div style={{fontSize:11,fontFamily:'var(--font-mono)',color:'var(--acc)',wordBreak:'break-all',lineHeight:1.6}}>{CRYPTO_ADDRS[cryptoSel]}</div>
                  <button onClick={() => navigator.clipboard?.writeText(CRYPTO_ADDRS[cryptoSel]).then(()=>showToast('amber','📋 Copied!'))} style={{marginTop:10,width:'100%',padding:8,background:'var(--card3)',border:'1px solid var(--border2)',borderRadius:8,color:'var(--txt)',fontSize:11,fontFamily:'var(--font-mono)',cursor:'pointer'}}>📋 Copy Address</button>
                </div>
                <label className="flbl">Amount (USD)</label>
                <input className="ifield" type="number" value={cryptoAmt} onChange={e => setCryptoAmt(parseInt(e.target.value)||0)} />
                <div className="chip-row">
                  {[25,50,100,250].map(v => <div key={v} className={`chip ${cryptoAmt===v?'active':''}`} onClick={() => setCryptoAmt(v)}>${v}</div>)}
                </div>
                <button className="pay-btn" onClick={doCryptoDeposit}>₿ Confirm Crypto Deposit</button>
                <div className="secure-note">🔒 Wallet-to-wallet · Non-custodial · Instant credit</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WITHDRAW MODAL */}
      {modal === 'wd' && (
        <div className="overlay open" onClick={e => e.target===e.currentTarget&&setModal('none')}>
          <div className="modal">
            <div className="m-handle" />
            <div className="m-close" onClick={() => setModal('none')}>✕</div>
            <div className="m-title">{wdStep===1?'Withdraw Funds':'Verify PIN'}</div>
            <div className="m-sub">{wdStep===1?'Credited within 1–2 business hours':'Confirm your identity'}</div>
            {wdStep === 1 && (
              <div>
                <label className="flbl">UPI ID</label>
                <input className="ifield" type="text" placeholder="yourname@upi" value={wdUpi} onChange={e => setWdUpi(e.target.value)} />
                <label className="flbl" style={{marginTop:12}}>Amount (₹)</label>
                <input className="ifield" type="number" placeholder="Enter amount" value={wdAmt} onChange={e => setWdAmt(e.target.value)} />
                <div style={{background:'rgba(245,166,35,.07)',border:'1px solid rgba(245,166,35,.2)',borderRadius:10,padding:'11px 14px',margin:'12px 0',fontSize:11,color:'var(--muted2)',fontFamily:'var(--font-mono)'}}>
                  Available: ₹{bal} | Min: ₹100
                </div>
                <button className="pay-btn" style={{background:'linear-gradient(135deg,#1d4ed8,#3b82f6)'}} onClick={() => {
                  if (!wdUpi.includes('@')) { showToast('red','⚠ Invalid UPI ID'); return }
                  const a = parseInt(wdAmt)
                  if (!a||a<100) { showToast('red','⚠ Min ₹100'); return }
                  if (a>state.balance) { showToast('red','⚠ Insufficient balance'); return }
                  setWdStep(2)
                }}>Continue → Verify PIN</button>
              </div>
            )}
            {wdStep === 2 && (
              <div>
                <div className="pin-verify-note">🔒 Enter your 6-digit PIN to confirm withdrawal</div>
                <div className="mini-pin">
                  {[0,1,2,3,4,5].map(i => <div key={i} className={`mini-pin-dot ${i<wdPin.length?'filled':''}`} />)}
                </div>
                <div className="mini-keypad">
                  {['1','2','3','4','5','6','7','8','9'].map(k => <div key={k} className="mini-key" onClick={() => handleWdPin(k)}>{k}</div>)}
                  <div className="mini-key empty" />
                  <div className="mini-key" onClick={() => handleWdPin('0')}>0</div>
                  <div className="mini-key del" onClick={() => setWdPin(p => p.slice(0,-1))}>⌫</div>
                </div>
                <div style={{textAlign:'center',marginTop:-4,marginBottom:10,fontSize:11,color:'var(--muted2)',cursor:'pointer'}} onClick={() => { setWdStep(1); setWdPin('') }}>← Go back</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GEAR MODAL */}
      {modal === 'gear' && (
        <div className="overlay open" onClick={e => e.target===e.currentTarget&&setModal('none')}>
          <div className="modal">
            <div className="m-handle" />
            <div className="m-close" onClick={() => setModal('none')}>✕</div>
            <div className="m-title">Bet Settings ⚙</div>
            <div className="m-sub">Customize your trading preferences</div>
            <div className="gear-row">
              <div className="gear-lbl">Max Bet Limit (₹)</div>
              <input className="gear-input" type="number" defaultValue={state.maxBetLimit} onChange={e => setState({maxBetLimit:parseInt(e.target.value)||1000})} />
            </div>
            <div className="gear-row">
              <div className="gear-lbl">Auto-repeat last bet</div>
              <div className={`toggle ${state.autoRepeat?'on':''}`} onClick={() => setState({autoRepeat:!state.autoRepeat})}><div className="tknob" /></div>
            </div>
            <div style={{height:16}} />
            <button className="btn-primary" onClick={() => { showToast('amber','⚙ Settings saved!'); setModal('none') }}>Save Settings</button>
          </div>
        </div>
      )}
    </div>
  )
}
