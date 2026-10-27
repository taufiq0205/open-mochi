"use client"

// Two component studies, using typed AI SDK fixtures. No backend mutations.
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FileText,
  Folder,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react"
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolOutput,
} from "@/components/ai-elements/tool"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import ThinkingState from "./beautiful-ui/ThinkingState"
import ToolChips, { type ToolStep } from "./beautiful-ui/ToolChips"
import styles from "./prototype.module.css"
import "./beautiful-ui/animations.css"

const fixture: UIMessage = {
  id: "sample-run",
  role: "assistant",
  parts: [
    {
      type: "reasoning",
      text: "Read the existing setup guide. Compare the service names with the Compose configuration. Write a short checklist with the missing setup steps.",
      state: "done",
    },
    {
      type: "tool-readFile",
      toolCallId: "read-1",
      state: "output-available",
      input: { path: "README.md" },
      output: "Read 86 lines. Setup section links to Docker Compose.",
    },
    {
      type: "tool-readFile",
      toolCallId: "read-2",
      state: "output-available",
      input: { path: "docker-compose.yml" },
      output: "Read 64 lines. Found web and PostgreSQL services.",
    },
    {
      type: "tool-writeFile",
      toolCallId: "write-1",
      state: "output-available",
      input: { path: "setup-checklist.md" },
      output: "Created a setup checklist with 4 steps.",
    },
    {
      type: "text",
      text: "I checked the README against your Compose file and drafted **setup-checklist.md**.\n\nTwo setup steps need more detail:\n\n- **Environment setup.** Explain which values are required and where to get them.\n- **Database initialization.** Put the schema command before the first launch.\n\nThe checklist puts them in order and ends with a startup check.",
    },
  ],
}
const people = [
  { name: "Mochi", role: "General assistant", seed: "ada" },
  { name: "Pixel", role: "Code reviewer", seed: "pixel" },
  { name: "Muse", role: "Writing editor", seed: "muse" },
]

export function UIPrototype() {
  const params = useSearchParams()
  const router = useRouter()
  const split = params.get("variant") === "b"
  const [bot, setBot] = useState(people[0])
  const [text, setText] = useState("")
  const [sent, setSent] = useState<string[]>([])
  const [create, setCreate] = useState(false)
  const [name, setName] = useState("")
  const [job, setJob] = useState("General assistant")
  const [nav, setNav] = useState(false)
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState("")
  const [run, setRun] = useState(0)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState("preview")
  const tools: ToolStep[] = fixture.parts
    .filter(isToolUIPart)
    .map((part) => ({
      icon: getToolName(part) === "writeFile" ? "write" : "read",
      label: getToolName(part) === "writeFile" ? "Write" : "Read",
      chip: String((part.input as { path: string }).path),
      mono: true,
      detailMono: false,
      detail: [{ text: String(part.output) }],
    }))
    .map((step, index) => ({
      ...step,
      label: ["Read file", "Inspect config", "Write file"][index],
    }))
  const reasoning = fixture.parts.find((p) => p.type === "reasoning")
  const activity = (
    <div className={styles.activity} key={run}>
      <ThinkingState
        variant="Steps"
        rows={(reasoning?.text ?? "")
          .split(". ")
          .map((primary) => ({ primary }))}
        active="Reviewing the setup"
        done="Reviewed setup · 3 steps"
      />
      <ToolChips
        steps={tools}
        diffs={[]}
        labels={{ header: "3 tool calls", more: "" }}
      />
    </div>
  )
  const output = (
    <div className={styles.output}>
      <div className={styles.outputToolbar}>
        <span>
          <FileText size={15} /> setup-checklist.md
        </span>
        <div>
          <button
            className={tab === "preview" ? styles.tabActive : ""}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
          <button
            className={tab === "source" ? styles.tabActive : ""}
            onClick={() => setTab("source")}
          >
            Source
          </button>
          <button
            aria-label="Copy checklist"
            onClick={() => {
              void navigator.clipboard.writeText(
                "Setup checklist: configure environment, start database, initialize schema, verify startup."
              )
              setNotice("Checklist copied.")
            }}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
      <div className={styles.document}>
        {tab === "preview" ? (
          <>
            <div className={styles.docLabel}>SETUP / GETTING STARTED</div>
            <h1>
              Before you <br />
              start the stack.
            </h1>
            <p className={styles.docIntro}>
              A short checklist for your first local setup.
            </p>
            <hr />
            {[
              "Configure your environment",
              "Start PostgreSQL",
              "Initialize the schema",
              "Verify the application",
            ].map((item, i) => (
              <div className={styles.docStep} key={item}>
                <span>0{i + 1}</span>
                <div>
                  <h2>{item}</h2>
                  <p>
                    {
                      [
                        "Copy the environment example and fill in the required service credentials.",
                        "Wait for the database health check before continuing.",
                        "Apply the application schema to your local database.",
                        "Open the workspace and check the health endpoint.",
                      ][i]
                    }
                  </p>
                  {i === 2 && <code>npm run db:push</code>}
                </div>
              </div>
            ))}
            <div className={styles.docFoot}>
              <span>Prepared by {bot.name}</span>
              <span>Demo document · 4 steps</span>
            </div>
          </>
        ) : (
          <pre>
            {
              "# Setup checklist\n\n1. Configure your environment\n2. Start PostgreSQL\n3. Initialize the schema\n   npm run db:push\n4. Verify the application\n\nDemo only; verify commands before use."
            }
          </pre>
        )}
      </div>
    </div>
  )
  const composer = (
    <div className={styles.composerWrap}>
      <PromptInput
        className={styles.composer}
        onSubmit={({ text: value }) => {
          if (value.trim()) {
            setSent([...sent, value.trim()])
            setText("")
          }
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            aria-label="Message bot"
            placeholder={`Message ${bot.name}…`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <div className={styles.promptTools}>
            <button
              type="button"
              aria-label="Add demo context"
              onClick={() =>
                setNotice(
                  "Demo context: README.md and docker-compose.yml are attached to this study."
                )
              }
            >
              <Plus size={17} />
            </button>
            <span>
              <ChatAvatar seed={bot.seed} className="size-4" /> {bot.name}{" "}
              <ChevronDown size={12} />
            </span>
          </div>
          <PromptInputSubmit
            disabled={!text.trim()}
            aria-label="Send demo message"
          >
            <ArrowUp size={16} />
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>
      <div className={styles.composerMeta}>
        <span>Local workspace</span>
        <span>Demo data · no model calls</span>
      </div>
    </div>
  )

  return (
    <div className={`${styles.root} ${split ? styles.split : styles.thread}`}>
      <aside className={`${styles.sidebar} ${nav ? styles.openNav : ""}`}>
        <div className={styles.workspaceName}>
          <span className={styles.logo}>
            m<span />
          </span>
          <strong>open-mochi</strong>
          <button aria-label="Close sidebar" onClick={() => setNav(false)}>
            <PanelLeftClose size={16} />
          </button>
        </div>
        <button
          className={styles.newChat}
          onClick={() => {
            setSent([])
            setNav(false)
            setNotice("New demo thread ready.")
          }}
        >
          <Plus size={16} /> New chat
        </button>
        <div className={styles.search}>
          <Search size={14} />
          <input
            aria-label="Search conversations"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className={styles.navLabel}>
          Bots
          <button aria-label="Create bot" onClick={() => setCreate(true)}>
            <Plus size={14} />
          </button>
        </div>
        {people
          .filter((p) =>
            `${p.name} ${p.role}`.toLowerCase().includes(query.toLowerCase())
          )
          .map((p) => (
            <button
              className={`${styles.bot} ${bot.name === p.name ? styles.activeBot : ""}`}
              key={p.name}
              onClick={() => {
                setBot(p)
                setNav(false)
              }}
            >
              <ChatAvatar seed={p.seed} className="size-7" />
              <span>
                {p.name}
                <small>{p.role}</small>
              </span>
              {bot.name === p.name && <span className={styles.activeDot} />}
            </button>
          ))}
        <div className={styles.navLabel}>
          Chats{" "}
          <button
            aria-label="Demo group chat"
            onClick={() =>
              setNotice(
                "Group handoff preview: Mochi → Pixel. No live handoff is made."
              )
            }
          >
            <Plus size={14} />
          </button>
        </div>
        {[
          "Review the setup guide",
          "A second pair of eyes",
          "Notes from this morning",
        ]
          .filter((x) => x.toLowerCase().includes(query.toLowerCase()))
          .map((x, i) => (
            <button
              className={`${styles.chatLink} ${i === 0 ? styles.activeChat : ""}`}
              key={x}
              onClick={() => setNotice(`${x} selected (demo).`)}
            >
              <MessageSquare size={13} />
              {x}
            </button>
          ))}
        {query &&
          !people.some((p) =>
            `${p.name} ${p.role}`.toLowerCase().includes(query.toLowerCase())
          ) && <span className={styles.empty}>No matching bots</span>}
        <div className={styles.sidebarFoot}>
          <button onClick={() => setCreate(true)}>
            <Plus size={15} /> Create a bot
          </button>
          <div>
            <span className={styles.userInitial}>J</span>
            <span>
              Jamie’s workspace<small>Self-hosted</small>
            </span>
            <button
              aria-label="Workspace settings"
              onClick={() =>
                setNotice("Settings are outside this component draft.")
              }
            >
              <Settings2 size={15} />
            </button>
          </div>
        </div>
      </aside>
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.mobileMenu}
            onClick={() => setNav(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <span className={styles.headerPath}>
            {split ? (
              <>
                <Folder size={14} /> Workspace <ChevronRight size={12} />
              </>
            ) : (
              <>
                <ChatAvatar seed={bot.seed} className="size-5" /> {bot.name}{" "}
                <ChevronRight size={12} />
              </>
            )}
            <strong>Review the setup guide</strong>
          </span>
          <div>
            <span className={styles.sampleTag}>
              DRAFT {split ? "02" : "01"}
            </span>
            <button
              aria-label="Replay demo activity"
              onClick={() => {
                setRun(run + 1)
                setNotice("Replaying fixture activity.")
              }}
            >
              <ArrowDown size={15} />
            </button>
            <button
              aria-label="More thread options"
              onClick={() =>
                setNotice("Component study: Beautiful UI + AI Elements.")
              }
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>
        <div className={styles.content}>
          {split && <section className={styles.artifactPane}>{output}</section>}
          <section className={styles.chatPane}>
            {split && (
              <div className={styles.chatTabs}>
                <span>
                  <MessageSquare size={14} /> Chat
                </span>
                <span>
                  <ChatAvatar seed={bot.seed} className="size-4" /> {bot.name}
                </span>
              </div>
            )}
            <Conversation
              className={styles.conversation}
              initial={false}
              resize="instant"
            >
              <ConversationContent className={styles.messages}>
                <div className={styles.day}>Today, 10:42</div>
                <Message from="user" className={styles.userMessage}>
                  <div className={styles.messageLabel}>
                    You <span>10:42</span>
                  </div>
                  <MessageContent>
                    Check the setup guide against the Compose file. Make me a
                    short checklist for a fresh install.
                  </MessageContent>
                  <div className={styles.contextAttachments}>
                    <span>
                      <FileText size={12} /> README.md
                    </span>
                    <span>
                      <File size={12} /> docker-compose.yml
                    </span>
                  </div>
                </Message>
                <Message from="assistant" className={styles.assistantMessage}>
                  <div className={styles.messageLabel}>
                    <ChatAvatar seed={bot.seed} className="size-6" />
                    {bot.name}
                    <span>10:42</span>
                  </div>
                  <MessageContent className={styles.assistantContent}>
                    {activity}
                    {fixture.parts.map((part, i) =>
                      part.type === "text" ? (
                        <MessageResponse key={i} className={styles.response}>
                          {part.text}
                        </MessageResponse>
                      ) : null
                    )}
                    {!split && (
                      <button
                        className={styles.fileCard}
                        onClick={() =>
                          setTab(tab === "preview" ? "source" : "preview")
                        }
                      >
                        <span className={styles.fileIcon}>
                          <FileText size={21} />
                        </span>
                        <span>
                          <strong>setup-checklist.md</strong>
                          <small>4 steps · Markdown</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {!split && tab === "source" && (
                      <pre className={styles.inlineFile}>
                        1. Configure environment{"\n"}2. Start PostgreSQL{"\n"}
                        3. Initialize schema{"\n"}4. Verify startup
                      </pre>
                    )}
                    <MessageActions>
                      <MessageAction
                        label="Copy answer"

                        onClick={() => {
                          void navigator.clipboard.writeText(
                            fixture.parts
                              .filter((p) => p.type === "text")
                              .map((p) => p.text)
                              .join("\n")
                          )
                          setNotice("Answer copied.")
                        }}
                      >
                        <Copy size={14} />
                      </MessageAction>
                      <span className={styles.messageMeta}>
                        3 tool calls · 2 files read
                      </span>
                    </MessageActions>
                  </MessageContent>
                </Message>
                {failed && (
                  <Tool defaultOpen className={styles.errorTool}>
                    <ToolHeader
                      type="tool-readFile"
                      state="output-error"
                      title="Read optional config"
                    />
                    <ToolContent>
                      <ToolOutput
                        output={undefined}
                        errorText="Demo error: config file was not found. Your files were not changed."
                      />
                      <button
                        className={styles.retry}
                        onClick={() => {
                          setFailed(false)
                          setNotice("Demo retry succeeded.")
                        }}
                      >
                        Retry
                      </button>
                    </ToolContent>
                  </Tool>
                )}
                {sent.map((value, i) => (
                  <Message from="user" key={i} className={styles.userMessage}>
                    <div className={styles.messageLabel}>You</div>
                    <MessageContent>{value}</MessageContent>
                    <p className={styles.demoReply}>
                      Demo received. This draft does not call a model.
                    </p>
                  </Message>
                ))}
              </ConversationContent>
            </Conversation>
            {composer}
          </section>
        </div>
        <footer className={styles.studyBar}>
          <div>
            <span className={styles.studyDot} /> Component study{" "}
            <strong>
              {split ? "02 / Working canvas" : "01 / Compact thread"}
            </strong>
          </div>
          <div>
            <button onClick={() => setFailed(!failed)}>
              {failed ? "Hide error" : "Show error state"}
            </button>
            <button
              onClick={() =>
                router.replace(`/ui-prototype?variant=${split ? "a" : "b"}`)
              }
            >
              {split ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}{" "}
              {split ? "Compact thread" : "Working canvas"}
            </button>
          </div>
        </footer>
      </main>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className={styles.createDialog}>
          <DialogHeader>
            <DialogTitle>Create a bot</DialogTitle>
            <DialogDescription>
              A name, a role, and instructions. You can edit these later.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setBot({ name, role: job, seed: name })
              setCreate(false)
              setNotice("Demo bot created in memory.")
            }}
          >
            <div className={styles.identity}>
              <ChatAvatar seed={name || "ada"} className="size-14" />
              <span>
                Make it yours<small>Avatar follows the bot’s name</small>
              </span>
            </div>
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mochi"
                maxLength={60}
              />
            </label>
            <label>
              Role
              <select value={job} onChange={(e) => setJob(e.target.value)}>
                {people.map((p) => (
                  <option key={p.role}>{p.role}</option>
                ))}
              </select>
            </label>
            <label>
              Instructions
              <textarea
                rows={4}
                defaultValue="Be concise. Read the relevant files first. Ask before destructive actions."
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setCreate(false)}>
                Cancel
              </button>
              <button type="submit">
                Create demo bot <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
          <button aria-label="Dismiss" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
