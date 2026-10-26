// USD millionths. Review these rates against the linked sources before changing models/resources.
export const USAGE_LIMIT = 5_000_000
export const BOT_LIMIT = 3
export const MAX_OUTPUT_TOKENS = 4096
export const LEASE_MINUTES = 5
export const SANDBOX_TTL_MINUTES = 6
export const STORAGE_TTL_MINUTES = 1440
export class UsageError extends Error {}
export const USAGE_ERROR =
  "Usage limit reached. View Usage for your allowance and reset time."

// Peak, cache-miss DeepSeek Flash prices: $0.30 input / $1.20 output per million tokens.
// Use the full 1M context ceiling (rounded up) to reserve before every provider request.
export const AI_RESERVATION = Math.ceil(
  1_100_000 * 0.3 + MAX_OUTPUT_TOKENS * 1.2
)
export function aiCost(input: number, output: number) {
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid provider usage")
  return Math.ceil(input * 0.3 + output * 1.2)
}

export function sandboxCost(
  cpu: number,
  memory: number,
  disk: number,
  gpu = 0
) {
  if (
    gpu ||
    ![cpu, memory, disk].every((n) => Number.isFinite(n) && n > 0) ||
    cpu > 4 ||
    memory > 8 ||
    disk > 10
  )
    throw new Error("Sandbox resources exceed this plan's limits.")
  // Six minutes of compute plus 24 hours of disk; do not rely on organization free storage.
  return Math.ceil((cpu * 50_400 + memory * 16_200) / 10 + disk * 108 * 24.1)
}
