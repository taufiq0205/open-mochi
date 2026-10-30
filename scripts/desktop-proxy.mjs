import { createServer } from "node:http"
import { pathToFileURL } from "node:url"
import WebSocket, { WebSocketServer } from "ws"
import { openDesktopTicket } from "../lib/desktop-ticket.mjs"

export function createDesktopProxy() {
  const server = createServer((req, res) => {
    res.writeHead(req.url === "/healthz" ? 200 : 404).end()
  })
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 4 * 1024 * 1024,
  })
  server.on("upgrade", (req, socket, head) => {
    let ticket
    try {
      if (req.headers.origin !== new URL(process.env.BETTER_AUTH_URL).origin)
        throw new Error("Invalid origin")
      ticket = openDesktopTicket(
        new URL(req.url, "http://localhost").searchParams.get("ticket")
      )
    } catch {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")
      return
    }
    const upstream = new WebSocket(ticket.target, ["binary"], {
      headers: ticket.headers,
      handshakeTimeout: 10_000,
      maxPayload: 4 * 1024 * 1024,
    })
    // Do not upgrade the browser until the authenticated upstream is ready.
    socket.pause()
    const abort = () => upstream.terminate()
    socket.once("close", abort)
    upstream.once("error", () => socket.destroy())
    upstream.once("open", () => {
      socket.removeListener("close", abort)
      if (socket.destroyed) return upstream.terminate()
      sockets.handleUpgrade(req, socket, head, (client) => {
        const close = () => {
          client.terminate()
          upstream.terminate()
        }
        const timer = setTimeout(close, ticket.expires - Date.now())
        const forward = (source, destination) => {
          source.on("message", (data, binary) => {
            if (
              destination.readyState !== WebSocket.OPEN ||
              destination.bufferedAmount > 4 * 1024 * 1024
            )
              return close()
            destination.send(data, { binary })
          })
          source.on("error", close)
          source.on("close", () => {
            clearTimeout(timer)
            close()
          })
        }
        forward(client, upstream)
        forward(upstream, client)
        socket.resume()
      })
    })
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  createDesktopProxy().listen(3001, "0.0.0.0")
