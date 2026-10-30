import assert from "node:assert/strict"
import { once } from "node:events"
import WebSocket, { WebSocketServer } from "ws"
import { createDesktopProxy } from "./desktop-proxy.mjs"
import { sealDesktopTicket, openDesktopTicket } from "../lib/desktop-ticket.mjs"

process.env.BETTER_AUTH_SECRET = "test-only-desktop-secret-".repeat(3)
process.env.BETTER_AUTH_URL = "http://localhost:3000"
const ticket = sealDesktopTicket("ws://localhost:1234/websockify", {
  token: "secret",
})
assert.ok(!ticket.includes("secret"))
assert.equal(openDesktopTicket(ticket).headers.token, "secret")
assert.throws(() => openDesktopTicket("bad"))
assert.throws(() => openDesktopTicket(ticket.slice(0, -4) + "AAAA"))
const now = Date.now
Date.now = () => now() + 300001
try {
  assert.throws(() => openDesktopTicket(ticket), /Expired/)
} finally {
  Date.now = now
}

const upstream = new WebSocketServer({ port: 0, host: "127.0.0.1" })
await once(upstream, "listening")
upstream.on("connection", (socket, request) => {
  assert.equal(request.url, "/websockify")
  assert.equal(request.headers["open-sandbox-api-key"], "private-token")
  assert.equal(request.headers["sandbox-test-port"], "6080")
  socket.on("message", (bytes) => socket.send(bytes))
})
const proxy = createDesktopProxy().listen(0, "127.0.0.1")
await once(proxy, "listening")
const origin = `http://127.0.0.1:${proxy.address().port}`
const target = `ws://127.0.0.1:${upstream.address().port}/websockify`
const relayTicket = sealDesktopTicket(target, {
  "open-sandbox-api-key": "private-token",
  "sandbox-test-port": "6080",
})
const url = `${origin.replace("http:", "ws:")}/?ticket=${relayTicket}`
try {
  assert.equal((await fetch(`${origin}/healthz`)).status, 200)
  for (const [badUrl, badOrigin] of [
    [url, "http://attacker.test"],
    [
      origin.replace("http:", "ws:") + "/?ticket=bad",
      process.env.BETTER_AUTH_URL,
    ],
  ]) {
    const client = new WebSocket(badUrl, { origin: badOrigin })
    await new Promise((resolve, reject) => {
      client.on("unexpected-response", (_, response) => {
        try {
          assert.equal(response.statusCode, 401)
          response.resume()
          client.terminate()
          resolve()
        } catch (error) {
          reject(error)
        }
      })
      client.on("error", () => {})
      client.on("open", () =>
        reject(new Error("Unauthorized connection accepted"))
      )
    })
  }
  const client = new WebSocket(url, ["binary"], {
    origin: process.env.BETTER_AUTH_URL,
  })
  await once(client, "open")
  const received = once(client, "message")
  client.send(Buffer.from([0, 1, 2, 255]))
  assert.deepEqual((await received)[0], Buffer.from([0, 1, 2, 255]))
  client.close()
  await once(client, "close")
} finally {
  for (const client of upstream.clients) client.terminate()
  await Promise.all([
    new Promise((resolve) => proxy.close(resolve)),
    new Promise((resolve) => upstream.close(resolve)),
  ])
}
console.log(
  "Desktop relay passed: encrypted/tampered/expired tickets, origin denial, private upstream headers, binary relay and cleanup (local sockets)."
)
