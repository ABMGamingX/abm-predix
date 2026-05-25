'use client'
export default function Toast({ color, msg }: { color: 'green'|'amber'|'red'; msg: string }) {
  return <div className={`toast show ${color}`}>{msg}</div>
}
