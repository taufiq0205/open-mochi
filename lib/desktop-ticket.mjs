import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

function key() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new Error("Desktop signing secret required")
  return createHash("sha256").update(`desktop:${secret}`).digest()
}

export function sealDesktopTicket(target, headers) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({ target, headers, expires: Date.now() + 300_000 })
    ),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

export function openDesktopTicket(ticket) {
  if (!ticket || ticket.length > 16384) throw new Error("Invalid ticket")
  const data = Buffer.from(ticket, "base64url")
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12))
  decipher.setAuthTag(data.subarray(12, 28))
  const result = JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString()
  )
  if (!Number.isFinite(result.expires) || result.expires <= Date.now())
    throw new Error("Expired ticket")
  if (!["ws:", "wss:"].includes(new URL(result.target).protocol))
    throw new Error("Invalid target")
  return result
}
