export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('pt-BR')
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Nome legivel para um event.code (ex.: KeyA -> A, Space -> Espaço). */
export function keyLabel(code: string): string {
  if (!code) return '—'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`
  if (code.startsWith('Arrow')) return code.slice(5)
  const named: Record<string, string> = {
    Space: 'Espaço',
    Enter: 'Enter',
    Escape: 'Esc',
    ShiftLeft: 'Shift Esq',
    ShiftRight: 'Shift Dir',
    ControlLeft: 'Ctrl Esq',
    ControlRight: 'Ctrl Dir',
    AltLeft: 'Alt Esq',
    AltRight: 'Alt Dir',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Tab: 'Tab',
  }
  return named[code] ?? code
}
