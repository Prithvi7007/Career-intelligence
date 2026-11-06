// API-first discovery does not require Playwright. Verification is an explicit
// operator opt-in because upstream --verify can require a Chromium installation
// when an API liveness check is inconclusive.
export function shouldVerifyPostings(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value ?? '').trim());
}
export function buildScanArgs(verify = false) {
  return verify ? ['--verify', '--quiet'] : ['--quiet'];
}
