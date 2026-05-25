'use client'
import { useState } from 'react'

interface Props {
  onRegisterComplete: (name: string, email: string) => void
  onLoginStart: (email: string) => void
  hasAccount: boolean
}

export default function AuthScreen({ onRegisterComplete, onLoginStart, hasAccount }: Props) {
  const [view, setView] = useState<'register' | 'login'>(hasAccount ? 'login' : 'register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [err, setErr] = useState('')

  function handleRegister() {
    if (!name.trim()) { setErr('Please enter your name'); return }
    if (!email.includes('@')) { setErr('Enter a valid email'); return }
    setErr('')
    onRegisterComplete(name.trim(), email.trim())
  }

  function handleLogin() {
    if (!loginEmail.includes('@')) { setErr('Enter a valid email'); return }
    setErr('')
    onLoginStart(loginEmail.trim())
  }

  return (
    <div className="screen active" style={{ position: 'relative' }}>
      <div className="auth-bg" />
      <div className="auth-content">
        <div className="auth-logo">Predict<span>X</span></div>
        <div className="auth-tagline">Beat the market. One candle at a time.</div>
        {view === 'register' && (
          <>
            <div className="auth-steps">
              <div className="auth-step active" />
              <div className="auth-step" />
            </div>
            <div className="auth-card">
              <div className="auth-card-title">Create Account</div>
              <div className="auth-card-sub">Enter your details to get started</div>
              {err && <div style={{ color: 'var(--dn)', fontSize: 12, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>⚠ {err}</div>}
              <div className="afield-wrap">
                <label className="afield-lbl">Full Name</label>
                <input className="afield" type="text" placeholder="Anil Kumar" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="afield-wrap">
                <label className="afield-lbl">Email Address</label>
                <input className="afield" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
              </div>
              <div style={{ height: 20 }} />
              <button className="btn-primary" onClick={handleRegister}>Continue →</button>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--muted2)' }}>
                Already have an account?{' '}
                <span style={{ color: 'var(--acc)', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setErr(''); setView('login') }}>Sign In</span>
              </div>
            </div>
          </>
        )}
        {view === 'login' && (
          <div className="auth-card">
            <div className="auth-card-title">Welcome Back</div>
            <div className="auth-card-sub">Sign in to your account</div>
            {err && <div style={{ color: 'var(--dn)', fontSize: 12, marginBottom: 10, fontFamily: 'var(--font-mono)' }}>⚠ {err}</div>}
            <div className="afield-wrap">
              <label className="afield-lbl">Email Address</label>
              <input className="afield" type="email" placeholder="you@example.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            </div>
            <div style={{ height: 20 }} />
            <button className="btn-primary" onClick={handleLogin}>Continue →</button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: 'var(--muted2)' }}>
              New user?{' '}
              <span style={{ color: 'var(--acc)', cursor: 'pointer', fontWeight: 700 }} onClick={() => { setErr(''); setView('register') }}>Create Account</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
