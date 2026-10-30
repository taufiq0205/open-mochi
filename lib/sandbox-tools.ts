import { tool } from "ai"
import { logger } from "@sentry/core"
import type { Sandbox } from "@alibaba-group/opensandbox"
import { randomUUID } from "node:crypto"
import { MEMORY_PATH, sandboxFiles } from "./opensandbox.mjs"
import { z } from "zod"

const path = z.string().min(1).max(4096)
const position = {
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
}

async function desktopCommand(sandbox: Sandbox, command: string[]) {
  const result = await sandbox.commands.run(command, {
    timeoutSeconds: 60,
    uid: 1000,
    gid: 1000,
    envs: { DISPLAY: ":0" },
  })
  if (result.error || result.exitCode !== 0)
    throw new Error("Desktop command failed")
  return { success: true }
}

export function createSandboxTools(resolveSandbox: () => Promise<Sandbox>) {
  let queue: Promise<unknown> = Promise.resolve()

  // Serialize actions so parallel model calls cannot race startup or desktop input.
  function run<T>(
    operation: (sandbox: Sandbox) => Promise<T>,
    options: { abortSignal?: AbortSignal },
    gui = false
  ) {
    const result = queue
      .then(async () => {
        options.abortSignal?.throwIfAborted()
        const sandbox = await resolveSandbox()
        try {
          options.abortSignal?.throwIfAborted()
          return await operation(sandbox)
        } finally {
          await sandbox.close()
        }
      })
      .catch(() => {
        logger.warn("Sandbox tool operation failed", { desktop: gui })
        throw new Error(
          "Sandbox operation failed. Check that the bot's sandbox is available and try again."
        )
      })
    queue = result.catch(() => undefined)
    return result
  }

  return {
    readMemory: tool({
      description:
        "Read this bot's persistent MEMORY.md, shared across its private and group chats.",
      inputSchema: z.object({}),
      execute: (_, options) =>
        run(async (sandbox) => {
          const info = (await sandboxFiles(sandbox).getFileInfo([MEMORY_PATH]))[
            MEMORY_PATH
          ]
          if (typeof info?.size !== "number" || info.size > 20000)
            throw new Error(
              "Memory exceeds 20000 bytes; use private chat to condense it."
            )
          return {
            content: await sandboxFiles(sandbox).readFile(MEMORY_PATH, {
              limit: 20000,
            }),
          }
        }, options),
    }),
    writeMemory: tool({
      description:
        "Replace this bot's MEMORY.md with concise durable notes. Read first and retain relevant existing notes.",
      inputSchema: z.object({ content: z.string().max(5000) }),
      execute: ({ content }, options) =>
        run(async (sandbox) => {
          await sandboxFiles(sandbox).writeFiles([
            { path: MEMORY_PATH, data: content, mode: 600 },
          ])
          return { written: true }
        }, options),
    }),
    bash: tool({
      description:
        "Run a shell command in the bot's sandbox. Commands time out after 60 seconds; output is limited to 20000 characters.",
      inputSchema: z.object({
        command: z.string().min(1).max(20000),
        cwd: path.optional(),
      }),
      execute: ({ command, cwd }, options) =>
        run(async (sandbox) => {
          const result = await sandbox.commands.run(
            command,
            {
              workingDirectory: cwd,
              timeoutSeconds: 60,
              uid: 1000,
              gid: 1000,
            },
            undefined,
            options.abortSignal
          )
          const output = [...result.logs.stdout, ...result.logs.stderr]
            .map((message) => message.text)
            .join("")
          const exitCode = result.exitCode ?? result.error?.exitCode
          if (exitCode == null) throw new Error("Command did not finish")
          return {
            exitCode,
            output: output.slice(0, 20000),
            truncated: output.length > 20000,
          }
        }, options),
    }),
    readFile: tool({
      description:
        "Read a UTF-8 text file in the sandbox, up to 1 MB. Output is limited to 20000 characters.",
      inputSchema: z.object({ path }),
      execute: ({ path }, options) =>
        run(async (sandbox) => {
          const info = (await sandboxFiles(sandbox).getFileInfo([path]))[path]
          if (typeof info?.size !== "number" || info.size > 1000000)
            throw new Error("File too large")
          const content = await sandboxFiles(sandbox).readFile(path, {
            limit: 1000000,
          })
          return {
            content: content.slice(0, 20000),
            truncated: content.length > 20000,
          }
        }, options),
    }),
    writeFile: tool({
      description:
        "Write UTF-8 text to a sandbox file, replacing its contents and creating parent directories.",
      inputSchema: z.object({ path, content: z.string().max(1000000) }),
      execute: ({ path, content }, options) =>
        run(async (sandbox) => {
          await sandboxFiles(sandbox).writeFiles([{ path, data: content }])
          return { written: true }
        }, options),
    }),
    listFiles: tool({
      description: "List a sandbox directory, up to 200 entries.",
      inputSchema: z.object({ path }),
      execute: ({ path }, options) =>
        run(async (sandbox) => {
          const files = await sandboxFiles(sandbox).listDirectory({
            path,
            depth: 1,
          })
          return { files: files.slice(0, 200), truncated: files.length > 200 }
        }, options),
    }),
    mouseClick: tool({
      description:
        "Click a screen coordinate. Inspect the screen before choosing coordinates.",
      inputSchema: z.object({
        ...position,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false),
      }),
      execute: ({ x, y, button, double }, options) =>
        run(
          async (sandbox) => {
            await desktopCommand(sandbox, [
              "xdotool",
              "mousemove",
              "--sync",
              String(x),
              String(y),
              "click",
              "--repeat",
              double ? "2" : "1",
              String({ left: 1, right: 3, middle: 2 }[button]),
            ])
            return { clicked: true }
          },
          options,
          true
        ),
    }),
    mouseMove: tool({
      description: "Move the mouse to a screen coordinate.",
      inputSchema: z.object(position),
      execute: ({ x, y }, options) =>
        run(
          (sandbox) =>
            desktopCommand(sandbox, [
              "xdotool",
              "mousemove",
              "--sync",
              String(x),
              String(y),
            ]),
          options,
          true
        ),
    }),
    mouseScroll: tool({
      description:
        "Scroll at a screen coordinate. Amount is scroll wheel ticks.",
      inputSchema: z.object({
        ...position,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z.number().int().min(1).max(100).default(3),
      }),
      execute: ({ x, y, direction, amount }, options) =>
        run(
          async (sandbox) => {
            const button = { up: 4, down: 5, left: 6, right: 7 }[direction]
            await desktopCommand(sandbox, [
              "xdotool",
              "mousemove",
              "--sync",
              String(x),
              String(y),
              "click",
              "--repeat",
              String(amount),
              String(button),
            ])
            return { scrolled: true }
          },
          options,
          true
        ),
    }),
    keyboardType: tool({
      description:
        "Type text into the focused desktop control. Newlines press Enter.",
      inputSchema: z.object({ text: z.string().min(1).max(20000) }),
      execute: ({ text }, options) =>
        run(
          async (sandbox) => {
            await desktopCommand(sandbox, [
              "xdotool",
              "type",
              "--clearmodifiers",
              "--",
              text,
            ])
            return { typed: true }
          },
          options,
          true
        ),
    }),
    keyboardPress: tool({
      description:
        "Press a key (such as enter, tab, escape, or a letter) with optional modifiers.",
      inputSchema: z.object({
        key: z.string().min(1).max(30),
        modifiers: z
          .array(z.enum(["ctrl", "alt", "shift", "cmd"]))
          .max(4)
          .optional(),
      }),
      execute: ({ key, modifiers }, options) =>
        run(
          async (sandbox) => {
            const keys: Record<string, string> = {
              enter: "Return",
              escape: "Escape",
              esc: "Escape",
              tab: "Tab",
              backspace: "BackSpace",
              space: "space",
              delete: "Delete",
              up: "Up",
              down: "Down",
              left: "Left",
              right: "Right",
            }
            const chord = [
              ...(modifiers ?? []).map((key) =>
                key === "cmd" ? "super" : key
              ),
              keys[key.toLowerCase()] ?? key,
            ].join("+")
            await desktopCommand(sandbox, [
              "xdotool",
              "key",
              "--clearmodifiers",
              "--",
              chord,
            ])
            return { pressed: true }
          },
          options,
          true
        ),
    }),
    viewScreen: tool({
      description:
        "Inspect the current desktop screenshot. Set showInChat to true when the user asks to see the screen or an image helps explain the result. Leave it false for routine internal inspection.",
      inputSchema: z.object({ showInChat: z.boolean().default(false) }),
      execute: ({ showInChat = false }, options) =>
        run(
          async (sandbox) => {
            const path = `/tmp/screenshot-${randomUUID()}.png`
            try {
              await desktopCommand(sandbox, ["scrot", "-p", path])
              const screenshot = Buffer.from(
                await sandboxFiles(sandbox).readBytes(path)
              ).toString("base64")
              return {
                screenshot: z.string().min(1).parse(screenshot),
                showInChat,
              }
            } finally {
              await sandboxFiles(sandbox).deleteFiles([path])
            }
          },
          options,
          true
        ),
      toModelOutput: ({ output }) => ({
        type: "content",
        value: [
          {
            type: "text",
            text: "Current screen. Coordinates are in pixels relative to the top-left corner.",
          },
          {
            type: "file",
            mediaType: "image/png",
            data: { type: "data", data: output.screenshot },
          },
        ],
      }),
    }),
  }
}
