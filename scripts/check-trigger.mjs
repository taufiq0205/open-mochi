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
for (const name of ["trigger-webapp", "trigger-supervisor"]) {
  assert.ok(s[name].image.endsWith(":v4.8.1"))
  assert.ok(s[name].healthcheck)
}
assert.equal(s.web.environment.TRIGGER_API_URL, "http://trigger-webapp:3000")
assert.equal(
  s["trigger-supervisor"].environment.TRIGGER_API_URL,
  "http://trigger-webapp:3000"
)
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
  if (!["web", "trigger-webapp", "trigger-registry"].includes(name))
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
