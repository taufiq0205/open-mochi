"use client"

import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { BILLING_ERROR, PAID_PLAN } from "@/lib/billing"
import { showUpgradeToast, showUsageToast } from "@/components/upgrade-toast"

import { useState, useTransition, type ReactNode } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm, useWatch } from "react-hook-form"
import { PlusIcon, ShuffleIcon } from "lucide-react"

import { createBot, updateBot, deleteBot } from "@/actions/bot"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { createBotSchema, type CreateBotInput } from "@/lib/db/schema"

const presets = [
  {
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    job: "Code reviewer",
    instructions:
      "Review code for bugs, security risks, and clarity. Explain issues and suggest small fixes.",
  },
  {
    job: "Writing editor",
    instructions:
      "Improve clarity, grammar, and flow while preserving my voice and meaning.",
  },
  {
    job: "Tutor",
    instructions:
      "Explain concepts step by step, use examples, and ask questions to check my understanding.",
  },
]

const defaults: CreateBotInput = {
  name: "",
  job: presets[0].job,
  instructions: presets[0].instructions,
  avatar: "ada",
}

export function BotDialog({
  children,
  bot,
}: {
  children?: ReactNode
  bot?: CreateBotInput & { id: string }
}) {
  const [open, setOpen] = useState(false)
  const { has } = useAuth()
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<CreateBotInput>({
    resolver: zodResolver(createBotSchema),
    defaultValues: bot ?? defaults,
  })
  const [avatar, job] = useWatch({
    control: form.control,
    name: ["avatar", "job"],
  })

  function onDelete() {
    if (!has?.(PAID_PLAN)) return showUpgradeToast()
    if (!bot) return
    setDeleteError(undefined)
    startTransition(async () => {
      try {
        const result = await deleteBot(bot.id)
        if (result.error) {
          if (result.error === BILLING_ERROR) showUpgradeToast()
          if ("usageLimit" in result && result.usageLimit)
            showUsageToast(result.error)
          setDeleteError(result.error)
          return
        }
        setConfirmDelete(false)
        setOpen(false)
        form.reset()
        toast.add({ title: `${bot.name} deleted.`, type: "success" })
        router.replace("/")
      } catch {
        setDeleteError("Could not delete your bot. Please try again.")
      }
    })
  }

  function onSubmit(values: CreateBotInput) {
    if (!has?.(PAID_PLAN)) return showUpgradeToast()
    form.clearErrors("root")
    startTransition(async () => {
      try {
        const result = bot
          ? await updateBot(bot.id, values)
          : await createBot(values)
        if (result.error) {
          if (result.error === BILLING_ERROR) showUpgradeToast()
          if ("usageLimit" in result && result.usageLimit)
            showUsageToast(result.error)
          form.setError("root", { message: result.error })
          return
        }
        setOpen(false)
        toast.add({
          title: bot ? `${values.name} updated.` : `${values.name} is ready.`,
          type: "success",
        })
      } catch {
        form.setError("root", {
          message: bot
            ? "Could not update your bot. Please try again."
            : "Could not create your bot. Please try again.",
        })
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return
        if (nextOpen && !has?.(PAID_PLAN)) return showUpgradeToast()
        form.reset(bot ?? { ...defaults, avatar: crypto.randomUUID() })
        setOpen(nextOpen)
      }}
    >
      {children ?? (
        <DialogTrigger render={<Button variant="secondary" />}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          Create a new bot
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Update its face, name, and how it should work."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
          noValidate
        >
          <ToggleGroup
            aria-label="Bot presets"
            variant="outline"
            className="flex-wrap"
            value={presets.some((preset) => preset.job === job) ? [job] : []}
            disabled={pending}
            onValueChange={(value) => {
              const preset = presets.find((preset) => preset.job === value[0])
              if (!preset) return
              form.setValue("job", preset.job, {
                shouldValidate: true,
                shouldDirty: true,
              })
              form.setValue("instructions", preset.instructions, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }}
          >
            {presets.map((preset) => (
              <ToggleGroupItem
                key={preset.job}
                value={preset.job}
                className="rounded-full"
              >
                {preset.job}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap items-center gap-4">
            <ChatAvatar seed={avatar} className="size-12" />
            <div className="flex flex-1 flex-col gap-1">
              <p>Face</p>
              <FieldDescription>
                Shuffle until you find one you like.
              </FieldDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() =>
                form.setValue("avatar", crypto.randomUUID(), {
                  shouldDirty: true,
                })
              }
            >
              <ShuffleIcon data-icon="inline-start" aria-hidden="true" />
              Shuffle
            </Button>
          </div>
          <FieldGroup>
            {(
              [
                {
                  name: "name",
                  label: "Name",
                  placeholder: "Ada",
                  maxLength: 100,
                },
                {
                  name: "job",
                  label: "Job",
                  placeholder: "Research assistant",
                  maxLength: 200,
                },
                {
                  name: "instructions",
                  label: "How it should work",
                  placeholder: presets[0].instructions,
                  maxLength: 10000,
                },
              ] as const
            ).map((item) => (
              <Controller
                key={item.name}
                name={item.name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid}
                    data-disabled={pending}
                  >
                    <FieldLabel htmlFor={`bot-${item.name}`}>
                      {item.label}
                    </FieldLabel>
                    {item.name === "instructions" ? (
                      <Textarea
                        {...field}
                        id={`bot-${item.name}`}
                        placeholder={item.placeholder}
                        maxLength={item.maxLength}
                        disabled={pending}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={
                          fieldState.invalid
                            ? `bot-${item.name}-error`
                            : undefined
                        }
                        className="min-h-28"
                      />
                    ) : (
                      <Input
                        {...field}
                        id={`bot-${item.name}`}
                        placeholder={item.placeholder}
                        maxLength={item.maxLength}
                        disabled={pending}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={
                          fieldState.invalid
                            ? `bot-${item.name}-error`
                            : undefined
                        }
                        className="h-10"
                      />
                    )}
                    {fieldState.invalid && (
                      <FieldError
                        id={`bot-${item.name}-error`}
                        errors={[fieldState.error]}
                      />
                    )}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
          <FieldError errors={[form.formState.errors.root]} />
          <DialogFooter>
            {bot && (
              <AlertDialog
                open={confirmDelete}
                onOpenChange={(nextOpen) => {
                  if (pending) return
                  setDeleteError(undefined)
                  setConfirmDelete(nextOpen)
                }}
              >
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pending}
                    />
                  }
                  className="sm:mr-auto"
                >
                  Delete bot
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the bot and its direct chat, and
                      removes it from group chats. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {deleteError && (
                    <p role="alert" className="text-sm text-destructive">
                      {deleteError}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      variant="destructive"
                      disabled={pending}
                      onClick={onDelete}
                    >
                      {pending && <Spinner data-icon="inline-start" />}
                      {pending ? "Deleting…" : "Delete bot"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending} />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {bot
                ? pending
                  ? "Saving…"
                  : "Save changes"
                : pending
                  ? "Creating…"
                  : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
