import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { createCipheriv } from "node:crypto"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import nextEnv from "@next/env"
import { Sandbox, SandboxApiException } from "@alibaba-group/opensandbox"
import WebSocket from "ws"
import {
  createSandbox,
  sandboxConfig,
  sandboxFiles,
  MEMORY_PATH,
} from "../lib/opensandbox.mjs"
import { createSandboxTools } from "../lib/sandbox-tools.ts"
import { createDesktopProxy } from "./desktop-proxy.mjs"
import { sealDesktopTicket } from "../lib/desktop-ticket.mjs"

nextEnv.loadEnvConfig(process.cwd())
process.env.OPEN_SANDBOX_DOMAIN =
  process.env.SANDBOX_LIVE_DOMAIN || "http://localhost:8085"
const endpoint = new URL(process.env.OPEN_SANDBOX_DOMAIN)
assert.equal((await fetch(new URL("/health", endpoint))).status, 200)
assert.equal((await fetch(new URL("/v1/sandboxes", endpoint))).status, 401)
const origin = process.env.BETTER_AUTH_URL
const proxy = createDesktopProxy().listen(0, "127.0.0.1")
await once(proxy, "listening")
let sandbox
try {
  sandbox = await createSandbox()
  const run = (command) =>
    sandbox.commands.run(command, {
      timeoutSeconds: 60,
      uid: 1000,
      gid: 1000,
      envs: { DISPLAY: ":0" },
    })
  const readyUntil = Date.now() + 30000
  while (
    (
      await run(
        "test -f /home/desktop/.vnc-password && xdpyinfo -display :0 >/dev/null"
      )
    ).exitCode !== 0
  ) {
    if (Date.now() > readyUntil) throw new Error("Desktop readiness timeout")
    await delay(500)
  }
  assert.equal(
    (await run("id -u")).logs.stdout
      .map((m) => m.text)
      .join("")
      .trim(),
    "1000"
  )
  const tools = createSandboxTools(() =>
    Sandbox.connect({
      sandboxId: sandbox.id,
      connectionConfig: sandboxConfig(),
    })
  )
  const options = { toolCallId: "live-check", messages: [] }
  assert.equal(
    (await tools.bash.execute({ command: "exit 7", cwd: "/tmp" }, options))
      .exitCode,
    7
  )
  const timed = await sandbox.commands.run(["sleep", "5"], {
    timeoutSeconds: 1,
    uid: 1000,
    gid: 1000,
  })
  assert.notEqual(timed.exitCode, 0)
  const files = sandboxFiles(sandbox)
  await tools.writeMemory.execute({ content: "durable-memory" }, options)
  assert.equal(await files.readFile(MEMORY_PATH), "durable-memory")
  await sandbox.pause()
  assert.equal((await sandbox.getInfo()).status.state, "Paused")
  const id = sandbox.id
  await sandbox.close()
  sandbox = await Sandbox.resume({
    sandboxId: id,
    connectionConfig: sandboxConfig(),
  })
  assert.equal(
    await sandboxFiles(sandbox).readFile(MEMORY_PATH),
    "durable-memory"
  )
  assert.deepEqual(await tools.readMemory.execute({}, options), {
    content: "durable-memory",
  })
  await tools.mouseClick.execute(
    { x: 0, y: 0, button: "left", double: false },
    options
  )
  await tools.mouseMove.execute({ x: 5, y: 5 }, options)
  await tools.mouseScroll.execute(
    { x: 5, y: 5, direction: "left", amount: 2 },
    options
  )
  await tools.keyboardPress.execute({ key: "escape", modifiers: [] }, options)
  await tools.keyboardType.execute({ text: "hello '$x'" }, options)
  const screen = await tools.viewScreen.execute({ showInChat: false }, options)
  const png = Buffer.from(screen.screenshot, "base64")
  assert.equal(png.subarray(1, 4).toString(), "PNG")
  assert.equal(png.readUInt32BE(16), 1280)
  assert.equal(png.readUInt32BE(20), 800)
  writeFileSync("/tmp/open-mochi-opensandbox-desktop.png", png)
  // Private-address egress must fail, including the sandbox host's service port.
  for (const host of ["172.17.0.1", "host.docker.internal"]) {
    const blocked = await run([
      "python3",
      "-c",
      `import socket; socket.create_connection((${JSON.stringify(host)},8085),timeout=2)`,
    ])
    assert.notEqual(blocked.exitCode, 0)
  }
  const url = new URL(await sandbox.getEndpointUrl(6080))
  url.pathname += "/websockify"
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:"
  const ticket = sealDesktopTicket(url.toString(), {
    "OPEN-SANDBOX-API-KEY": sandboxConfig().apiKey,
  })
  const ws = new WebSocket(
    `ws://127.0.0.1:${proxy.address().port}/?ticket=${ticket}`,
    ["binary"],
    { origin }
  )
  const queue = []
  let wake
  ws.on("message", (data) => {
    queue.push(Buffer.from(data))
    wake?.()
  })
  ws.on("error", () => {})
  await once(ws, "open")
  async function read() {
    if (!queue.length)
      await Promise.race([
        new Promise((resolve) => {
          wake = resolve
        }),
        delay(5000).then(() => {
          throw new Error("VNC read timeout")
        }),
      ])
    wake = undefined
    return queue.shift()
  }
  try {
    assert.match((await read()).toString(), /^RFB 003\./)
    ws.send(Buffer.from("RFB 003.008\n"))
    const types = await read()
    assert.ok(
      types.subarray(1).includes(2),
      "VNC password authentication required"
    )
    assert.ok(
      !types.subarray(1).includes(1),
      "Unauthenticated VNC must be unavailable"
    )
    ws.send(Buffer.from([2]))
    const challenge = await read()
    assert.equal(challenge.length, 16)
    const password = await sandboxFiles(sandbox).readFile(
      "/home/desktop/.vnc-password"
    )
    const key = Buffer.alloc(8)
    for (let i = 0; i < 8; i++) {
      const byte = password.charCodeAt(i) || 0
      let reversed = 0
      for (let bit = 0; bit < 8; bit++)
        reversed |= ((byte >> bit) & 1) << (7 - bit)
      key[i] = reversed
    }
    const cipher = createCipheriv(
      "des-ede3",
      Buffer.concat([key, key, key]),
      null
    )
    cipher.setAutoPadding(false)
    ws.send(Buffer.concat([cipher.update(challenge), cipher.final()]))
    assert.equal(
      (await read()).readUInt32BE(0),
      0,
      "VNC password accepted through authenticated relay"
    )
  } finally {
    ws.terminate()
  }
  await sandbox.renew(3)
  await sandbox.pause()
  let expired = false
  for (let attempt = 0; attempt < 15; attempt++) {
    await delay(1000)
    try {
      await sandbox.getInfo()
    } catch (error) {
      if (error instanceof SandboxApiException && error.statusCode === 404) {
        expired = true
        break
      }
      throw error
    }
  }
  assert.equal(expired, true, "Native expiry deletes the disposable sandbox")
  console.log(
    "Live OpenSandbox passed: auth, non-root shell/nonzero exits, files/memory across pause-resume, GUI/PNG, private-address egress denial, password-authenticated VNC through relay and native expiry."
  )
} finally {
  if (sandbox) {
    try {
      await sandbox.kill()
    } catch (error) {
      if (!(error instanceof SandboxApiException) || error.statusCode !== 404)
        throw error
    } finally {
      await sandbox.close()
    }
  }
  await new Promise((resolve) => proxy.close(resolve))
}
