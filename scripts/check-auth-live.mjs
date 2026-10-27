import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { setTimeout } from "node:timers/promises"

const origin = process.argv[2] ?? "http://localhost:3000"
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
  "Local stack only"
)
const ids = []
const suffix = randomUUID()
const password = randomUUID()
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "mochi",
      "-d",
      "mochi",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { encoding: "utf8" }
  ).trim()
async function request(path, body, cookie, requestOrigin = origin) {
  const send = () =>
    fetch(new URL(path, origin), {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const response = await send()
  if (response.status !== 429) return response
  const seconds = Number(response.headers.get("retry-after") ?? 10)
  assert.ok(Number.isFinite(seconds) && seconds >= 0 && seconds <= 60)
  await setTimeout((seconds + 1) * 1000)
  return send()
}
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ")
try {
  assert.equal((await request("/api/auth/ok")).status, 200)
  for (const invalidPassword of ["short", "x".repeat(129)]) {
    const response = await request("/api/auth/sign-up/email", {
      email: `policy-${suffix}@example.invalid`,
      password: invalidPassword,
      name: "Policy check",
    })
    assert.equal(
      response.status,
      400,
      "Password policy is enforced by the server"
    )
  }
  const accounts = []
  for (let i = 0; i < 2; i++) {
    const email = `auth-check-${i}-${suffix}@example.invalid`
    const response = await request("/api/auth/sign-up/email", {
      email,
      password,
      name: "Auth check",
      id: "spoofed-id",
    })
    assert.equal(
      response.status,
      200,
      `signup: ${response.status === 200 ? "ok" : await response.text()}`
    )
    const result = await response.json()
    assert.match(result.user.id, /^[a-zA-Z0-9_-]+$/)
    ids.push(result.user.id)
    assert.notEqual(result.user.id, "spoofed-id")
    assert.ok(
      response.headers
        .getSetCookie()
        .some((value) => /httponly/i.test(value) && /samesite=lax/i.test(value))
    )
    const cookie = cookies(response)
    const update = await request(
      "/api/auth/update-user",
      { name: "Auth check", id: "spoofed-update" },
      cookie
    )
    assert.equal(update.status, 200)
    assert.equal((await (await request("/api/auth/get-session", null, cookie)).json()).user.id, result.user.id)
    assert.ok(cookie)
    const session = await (
      await request("/api/auth/get-session", null, cookie)
    ).json()
    assert.equal(session.user.id, result.user.id)
    assert.equal((await request("/dashboard", null, cookie)).status, 200)
    assert.equal(
      (await request("/sign-in", null, cookie)).status,
      307,
      "Authenticated users skip the login page"
    )
    for (const path of ["/api/entitlement", "/pricing", "/usage"])
      assert.equal((await request(path, null, cookie)).status, 404)
    accounts.push({ email, cookie, id: result.user.id })
  }
  const [first, second] = accounts
  const botId = `auth-check-${suffix}`
  const chatId = `auth-check-${suffix}`
  sql(
    `INSERT INTO bots (id,user_id,name,avatar,job) VALUES ('${botId}','${first.id}','owner-only-${suffix}','check','Check'); INSERT INTO chats (id,user_id) VALUES ('${chatId}','${first.id}'); INSERT INTO chat_members (chat_id,bot_id) VALUES ('${chatId}','${botId}')`
  )
  const ownedChat = await request(`/chats/${chatId}`, null, first.cookie)
  assert.match(await ownedChat.text(), new RegExp(`owner-only-${suffix}`))
  const deniedChat = await request(`/chats/${chatId}`, null, second.cookie)
  // Next.js can stream the not-found boundary after HTTP headers have been sent.
  assert.ok([200, 404].includes(deniedChat.status))
  const deniedBody = await deniedChat.text()
  assert.match(deniedBody, /This page could not be found/)
  assert.ok(!deniedBody.includes(`owner-only-${suffix}`))

  assert.equal(
    (
      await request("/api/auth/sign-in/email", {
        email: first.email,
        password: "incorrect-password",
      })
    ).status,
    401
  )
  assert.equal(
    (
      await request(
        "/api/auth/sign-in/email",
        { email: first.email, password },
        null,
        "https://untrusted.invalid"
      )
    ).status,
    403
  )
  assert.equal(
    (await request("/api/auth/sign-out", {}, first.cookie)).status,
    200
  )
  assert.equal(
    await (await request("/api/auth/get-session", null, first.cookie)).json(),
    null
  )
  const login = await request("/api/auth/sign-in/email", {
    email: first.email,
    password,
  })
  assert.equal(login.status, 200)
  const loginCookie = cookies(login)
  assert.equal((await request("/dashboard", null, loginCookie)).status, 200)
  sql(
    `UPDATE auth_session SET expires_at=now()-interval '1 minute' WHERE user_id='${first.id}'`
  )
  assert.equal(
    await (await request("/api/auth/get-session", null, loginCookie)).json(),
    null
  )
  assert.equal((await request("/dashboard", null, loginCookie)).status, 307)
  console.log(
    "Live auth passed: signup, immutable identity, password login, origin rejection, signout, expired session, removed billing routes, cross-user chat denial."
  )
} finally {
  if (ids.length) {
    const list = ids.map((id) => `'${id}'`).join(",")
    sql(
      `DELETE FROM chats WHERE user_id IN (${list}); DELETE FROM bots WHERE user_id IN (${list}); DELETE FROM auth_user WHERE id IN (${list})`
    )
  }
}
