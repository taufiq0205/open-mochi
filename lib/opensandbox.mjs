import { randomBytes } from "node:crypto"
import {
  Sandbox,
  SandboxManager,
  SandboxApiException,
} from "@alibaba-group/opensandbox"

export const STORAGE_TTL_SECONDS = 86400
export const IDLE_TIMEOUT_MS = 5 * 60_000
export const MEMORY_PATH = "/home/desktop/MEMORY.md"
export const DESKTOP_PASSWORD_PATH = "/home/desktop/.vnc-password"

export function sandboxConfig() {
  if (!process.env.OPEN_SANDBOX_API_KEY)
    throw new Error("OPEN_SANDBOX_API_KEY is required")
  return {
    domain:
      process.env.OPEN_SANDBOX_DOMAIN || "http://host.docker.internal:8085",
    apiKey: process.env.OPEN_SANDBOX_API_KEY,
    useServerProxy: true,
    requestTimeoutSeconds: 60,
  }
}

/** @param {string} id */
export function openSandboxId(id) {
  if (!id.startsWith("osb:") || id.length <= 4)
    throw new Error("Legacy sandbox requires an explicit migration.")
  return id.slice(4)
}

export function getSandboxManager() {
  return SandboxManager.create({ connectionConfig: sandboxConfig() })
}

export function isSandboxMissing(error) {
  return error instanceof SandboxApiException && error.statusCode === 404
}

export function createSandbox() {
  return Sandbox.create({
    connectionConfig: sandboxConfig(),
    image: process.env.OPEN_SANDBOX_IMAGE || "open-mochi-sandbox:local",
    entrypoint: ["/usr/local/bin/start-desktop"],
    env: {
      DISPLAY: ":0",
      HOME: "/home/desktop",
      VNC_PASSWORD: randomBytes(8).toString("hex"),
    },
    resource: { cpu: "1", memory: "2Gi" },
    timeoutSeconds: STORAGE_TTL_SECONDS,
    // Block lateral access to other sandboxes, host services and metadata endpoints.
    networkPolicy: {
      defaultAction: "allow",
      egress: [
        "0.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "169.254.0.0/16",
        "100.64.0.0/10",
      ].map((target) => ({ action: "deny", target })),
    },
  })
}

/** @param {string} id */
export async function deleteSandbox(id) {
  const rawId = openSandboxId(id)
  const manager = getSandboxManager()
  try {
    await manager.killSandbox(rawId)
  } catch (error) {
    if (!isSandboxMissing(error)) throw error
  } finally {
    await manager.close()
  }
}

/** @param {import("@alibaba-group/opensandbox").Sandbox} sandbox */
export function sandboxFiles(sandbox) {
  if (!sandbox.files.withIdentity)
    throw new Error("Filesystem identity is unavailable")
  return sandbox.files.withIdentity(1000, 1000)
}
