import { tool } from "ai"
import { logger } from "@sentry/core"
import type { Sandbox } from "@daytona/sdk"
import { z } from "zod"

const path = z.string().min(1).max(4096)
const position = {
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
}

export function createSandboxTools(resolveSandbox: () => Promise<Sandbox>) {
  let desktop: Promise<unknown> | undefined
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
        const ready = resolveSandbox().then(async (sandbox) => {
          if (["stopped", "archived", "paused"].includes(sandbox.state ?? ""))
            await sandbox.start()
          else if (
            sandbox.state === "starting" ||
            sandbox.state === "restoring"
          )
            await sandbox.waitUntilStarted()
          else if (sandbox.state !== "started")
            throw new Error("Sandbox is unavailable")
          return sandbox
        })
        const sandbox = await ready
        options.abortSignal?.throwIfAborted()
        if (gui) {
          desktop ??= sandbox.computerUse.start()
          await desktop
        }
        options.abortSignal?.throwIfAborted()
        // shortcut: in-flight SDK calls cannot be aborted; add cancellable sessions when hard cancellation is needed.
        return operation(sandbox)
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
          const info = await sandbox.fs.getFileDetails("MEMORY.md")
          if (info.size > 20000)
            throw new Error(
              "Memory exceeds 20000 bytes; use private chat to condense it."
            )
          return {
            content: (await sandbox.fs.downloadFile("MEMORY.md", 60)).toString(
              "utf8"
            ),
          }
        }, options),
    }),
    writeMemory: tool({
      description:
        "Replace this bot's MEMORY.md with concise durable notes. Read first and retain relevant existing notes.",
      inputSchema: z.object({ content: z.string().max(5000) }),
      execute: ({ content }, options) =>
        run(async (sandbox) => {
          await sandbox.fs.uploadFile(Buffer.from(content), "MEMORY.md", 60)
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
          const result = await sandbox.process.executeCommand(
            command,
            cwd,
            undefined,
            60
          )
          return {
            exitCode: result.exitCode,
            output: result.result.slice(0, 20000),
            truncated: result.result.length > 20000,
          }
        }, options),
    }),
    readFile: tool({
      description:
        "Read a UTF-8 text file in the sandbox, up to 1 MB. Output is limited to 20000 characters.",
      inputSchema: z.object({ path }),
      execute: ({ path }, options) =>
        run(async (sandbox) => {
          const info = await sandbox.fs.getFileDetails(path)
          if (info.size > 1000000) throw new Error("File too large")
          const content = (await sandbox.fs.downloadFile(path, 60)).toString(
            "utf8"
          )
          return {
            content: content.slice(0, 20000),
            truncated: content.length > 20000,
          }
        }, options),
    }),
    writeFile: tool({
      description:
        "Write UTF-8 text to a sandbox file, replacing its contents. Parent directory must exist.",
      inputSchema: z.object({ path, content: z.string().max(1000000) }),
      execute: ({ path, content }, options) =>
        run(async (sandbox) => {
          await sandbox.fs.uploadFile(Buffer.from(content), path, 60)
          return { written: true }
        }, options),
    }),
    listFiles: tool({
      description: "List a sandbox directory, up to 200 entries.",
      inputSchema: z.object({ path }),
      execute: ({ path }, options) =>
        run(async (sandbox) => {
          const files = await sandbox.fs.listFiles(path)
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
          (sandbox) => sandbox.computerUse.mouse.click(x, y, button, double),
          options,
          true
        ),
    }),
    mouseMove: tool({
      description: "Move the mouse to a screen coordinate.",
      inputSchema: z.object(position),
      execute: ({ x, y }, options) =>
        run((sandbox) => sandbox.computerUse.mouse.move(x, y), options, true),
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
          async (sandbox) => ({
            scrolled: await sandbox.computerUse.mouse.scroll(
              x,
              y,
              direction,
              amount
            ),
          }),
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
            await sandbox.computerUse.keyboard.type(text)
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
            await sandbox.computerUse.keyboard.press(key, modifiers)
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
            const result = await sandbox.computerUse.screenshot.takeFullScreen()
            return {
              screenshot: z.string().min(1).parse(result.screenshot),
              showInChat,
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
