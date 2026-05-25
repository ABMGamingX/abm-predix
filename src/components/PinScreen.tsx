'use client'
import { useState, useEffect } from 'react'

interface Props {
  mode: 'setup' | 'confirm' | 'login'
  userName: string
  onSetupComplete: (pin: string) => void
  onLoginComplete: (pin: string) => boolean
  showToast: (color: 'green' | 'amber' | 'red', msg: string) => void
}

export default function PinScreen({ mode, userName, onSetupComplete, onLoginComplete, showToast }: Props) {
  const [buf, setBuf] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [phase, setPhase] = useState<'setup' | 'confirm' | 'login'>(mode)
  const [dotError, setDotError] = useState(false)

  useEffect(() => { setPhase(mode); setBuf(''); setFirstPin('') }, [mode])

  function shake() {
    setDotError(true)
    setTimeout(() => { setDotError(false); setBuf('') }, 500)
  }

  function handleKey(k: string) {
    if (buf.length >= 6) return
    const next = buf + k
    setBuf(next)
    if (next.length === 6) {
      setTimeout(() => {
        if (phase === 'setup') {
          setFirstPin(next); setBuf(''); setPhase('confirm')
        } else if (phase === 'confirm') {
          if (next === firstPin) { onSetupComplete(next) }
          else { showToast('red', "⚠ PINs don't match"); shake(); setPhase('setup'); setFirstPin('') }
        } else {
          const ok = onLoginComplete(next)
          if (!ok) { showToast('red', '⚠ Wrong PIN'); shake() }
        }
      }, 180)
    }
  }

  function handleDel() { setBuf(b => b.slice(0, -1)) }

  const title = phase === 'setup' ? 'Set Your PIN' : phase === 'confirm' ? 'Confirm PIN' : 'Welcome Back!'
  const sub = phase === 'setup' ? 'Create a 6-digit PIN to\nsecure your account' : phase === 'confirm' ? 'Re-enter your PIN\nto confirm' : `${userName}\nEnter your PIN to continue`

  return (
    <div className="screen active pin-screen">
      <div className="pin-content">
        <div className="pin-icon">{phase === 'login' ? '👤' : '🔐'}</div>
        <div className="pin-title">{title}</div>
        <div className="pin-sub">{sub}</div>
        <div className="pin-dots">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className={`pin-dot ${i < buf.length ? (dotError ? 'error' : 'filled') : ''}`} />
          ))}
        </div>
        <div className="pin-keypad">
          {[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ']].map(([n,l]) => (
            <div key={n} className="pin-key" onClick={() => handleKey(n)}>
              <div className="pin-key-num">{n}</div>
              {l && <div className="pin-key-letters">{l}</div>}
            </div>
          ))}
          <div className="pin-key empty" />
          <div className="pin-key" onClick={() => handleKey('0')}><div className="pin-key-num">0</div></div>
          <div className="pin-key del" onClick={handleDel}><div className="pin-key-num">⌫</div></div>
        </div>
      </div>
    </div>
  )
}
