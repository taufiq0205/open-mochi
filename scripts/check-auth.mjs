import assert from "node:assert/strict"

const baseUrl = process.argv[2] ?? "http://localhost:3000"

for (const path of ["/sign-in", "/sign-up"]) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" })
  assert.equal(response.status, 200, `${path} should be public`)
}

for (const [path, content] of [
  ["/", "Meet your first bot"],
  ["/dashboard", "You are signed in."],
]) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
  })
  assert.ok(
    [302, 303, 307, 308].includes(response.status),
    `Signed-out access to ${path} must redirect`
  )
  assert.equal(
    new URL(response.headers.get("location"), baseUrl).pathname,
    "/sign-in"
  )
  assert.ok(
    !(await response.text()).includes(content),
    `Protected content at ${path} must not leak`
  )
}
console.log(
  "Auth smoke check passed: sign-in/up load; signed-out home and dashboard access redirects."
)
