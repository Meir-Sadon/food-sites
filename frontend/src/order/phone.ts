/** Mirrors the server: "+972 50-123-4567" and "0501234567" are the same phone. Null when not plausible. */
export function normalizePhone(input: string): string | null {
  let digits = ''
  const text = input.trim()
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c >= '0' && c <= '9') digits += c
    else if ((c === '+' && i === 0) || c === ' ' || c === '-' || c === '(' || c === ')') continue
    else return null
  }
  if (digits.startsWith('972')) digits = '0' + digits.slice(3)
  if (digits.length < 9 || digits.length > 10 || digits[0] !== '0' || digits[1] === '0') return null
  return digits
}
