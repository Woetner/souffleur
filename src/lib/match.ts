export function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function lev(a: string, b: string): number {
  if (a === b) return 0
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

export const similar = (a: string, b: string) => a === b || (Math.min(a.length, b.length) > 3 && lev(a, b) <= Math.floor(Math.max(a.length, b.length) / 4))

/** Share of expected words that were heard (in order), 0..1 */
export function coverage(expected: string[], heard: string[]): number {
  if (!expected.length) return 1
  // LCS with fuzzy equality
  const m = expected.length
  const n = heard.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = similar(expected[i - 1], heard[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[m][n] / m
}

/** Did she reach the end of the line? Checks the last words of the expected text. */
export function reachedEnd(expected: string[], heard: string[]): boolean {
  if (!expected.length) return true
  const tail = expected.slice(-Math.min(2, expected.length))
  const recent = heard.slice(-6)
  return tail.every((w) => recent.some((h) => similar(w, h)))
}
