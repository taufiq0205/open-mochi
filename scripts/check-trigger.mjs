import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

// Compose config needs configured files, but does not contact the Docker daemon.
const config = JSON.parse(
  execFileSync("docker", ["compose", "config", "--format", "json"], {
    encoding: "utf8",
  })
)
const s = config.services
assert.equal(s["desktop-proxy"].build.target, "desktop-proxy")
assert.ok(s["desktop-proxy"].healthcheck)
assert.equal(
  s["desktop-proxy"].environment.BETTER_AUTH_SECRET,
  s.web.environment.BETTER_AUTH_SECRET
)
assert.equal(
  s["desktop-proxy"].environment.BETTER_AUTH_URL,
  s.web.environment.BETTER_AUTH_URL
)
assert.equal(s.opensandbox.image, "opensandbox/server:release-1.2.0")
assert.equal(s.opensandbox.network_mode, "bridge")
assert.ok(s.opensandbox.healthcheck)
assert.equal(
  s.opensandbox.environment.OPENSANDBOX_SERVER_API_KEY,
  s.web.environment.OPEN_SANDBOX_API_KEY
)
assert.ok(
  s.opensandbox.volumes.some(
    (v) => v.type === "volume" && v.target === "/root/.opensandbox"
  )
)
assert.ok(
  s.opensandbox.volumes.some((v) => v.target === "/var/run/docker.sock")
)
assert.deepEqual(s["sandbox-image"].entrypoint, ["/bin/true"])
assert.equal(s["sandbox-image"].network_mode, "none")
const sandboxConfig = readFileSync(
  new URL("../infra/opensandbox/config.toml", import.meta.url),
  "utf8"
)
assert.match(sandboxConfig, /publish_host = "127.0.0.1"/)
assert.match(sandboxConfig, /mode = "dns\+nft"/)
assert.match(sandboxConfig, /disable_ipv6 = true/)
for (const name of ["trigger-webapp", "trigger-supervisor"]) {
  assert.ok(s[name].image.endsWith(":v4.8.1"))
  assert.ok(s[name].healthcheck)
}
assert.equal(s.web.environment.TRIGGER_API_URL, "http://trigger-webapp:3000")
assert.equal(
  s["trigger-webapp"].environment.API_ORIGIN,
  s["trigger-webapp"].environment.APP_ORIGIN,
  "CLI project URLs must use the host-reachable platform origin"
)
assert.equal(
  s["trigger-supervisor"].environment.TRIGGER_API_URL,
  "http://trigger-webapp:3000"
)
for (const key of ["INTERNAL_API_ORIGIN", "STREAM_ORIGIN"]) {
  assert.equal(
    s["trigger-webapp"].environment[key],
    "http://trigger-webapp:3000",
    `${key} must be reachable from deployed worker containers`
  )
}
assert.equal(s["trigger-webapp"].environment.INTERNAL_API_ORIGIN_ENABLED, "1")
assert.equal(s["trigger-webapp"].environment.REDIS_HOST, "trigger-redis")
assert.equal(
  new URL(s["trigger-webapp"].environment.DATABASE_URL).hostname,
  "trigger-postgres"
)
assert.equal(
  new URL(s["trigger-webapp"].environment.DATABASE_URL).username,
  "postgres"
)
assert.equal(new URL(s.web.environment.DATABASE_URL).hostname, "postgres")
assert.equal(config.networks.default.name, "open-mochi_default")
assert.ok("trigger-webapp" in s.web.networks)
assert.ok(
  s["trigger-supervisor"].environment.DOCKER_RUNNER_NETWORKS.split(
    ","
  ).includes("open-mochi_default")
)
assert.equal(
  s["trigger-supervisor"].environment.DOCKER_AUTOREMOVE_EXITED_CONTAINERS,
  "1"
)
for (const [name, service] of Object.entries(s)) {
  for (const port of service.ports ?? [])
    assert.equal(port.host_ip, "127.0.0.1", `${name} must bind loopback`)
  if (
    ![
      "web",
      "desktop-proxy",
      "opensandbox",
      "trigger-webapp",
      "trigger-registry",
    ].includes(name)
  )
    assert.equal(service.ports?.length ?? 0, 0)
}
for (const name of [
  "trigger-postgres",
  "trigger-redis",
  "trigger-clickhouse",
  "trigger-minio",
  "trigger-s2",
  "trigger-registry",
]) {
  assert.ok(
    s[name].volumes.some((v) => v.type === "volume"),
    `${name} needs persistence`
  )
}
assert.equal(s["trigger-docker-proxy"].ports, undefined)
assert.ok(!s.web.environment.MANAGED_WORKER_SECRET)
assert.ok(!s.web.environment.TRIGGER_PLATFORM_MANAGED_WORKER_SECRET)
const worker = readFileSync(
  new URL("../trigger/chat.ts", import.meta.url),
  "utf8"
)
assert.match(worker, /JOIN auth_user u ON u.id = c.user_id/)
assert.match(
  readFileSync(new URL("../components/chat.tsx", import.meta.url), "utf8"),
  /baseURL: process.env.NEXT_PUBLIC_TRIGGER_API_URL/
)
console.log(
  "Trigger config passed: version pairing, private databases, worker networking, persistence, loopback ports and browser routing. No live execution claimed."
)
