"use client"

import { useAuth } from "@clerk/nextjs"
import { BILLING_ERROR, PAID_PLAN } from "@/lib/billing"
import { showUpgradeToast } from "@/components/upgrade-toast"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  createGroupChat,
  updateGroupChat,
  deleteGroupChat,
} from "@/actions/group-chat"
import {
  createGroupChatSchema,
  type CreateGroupChatInput,
} from "@/lib/db/schema"
import type { ChatBot } from "@/queries/chats"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from "@/components/ui/field"
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
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"

export function GroupChatDialog({
  bots,
  group,
  children,
  open,
  onOpenChange: setOpen,
}: {
  bots: ChatBot[]
  group?: CreateGroupChatInput & { id: string }
  children?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { has } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const form = useForm<CreateGroupChatInput>({
    resolver: zodResolver(createGroupChatSchema),
    defaultValues: group ?? { name: "", botIds: [] },
  })
  const selected = useWatch({ control: form.control, name: "botIds" })
  function onDelete() {
    if (!has?.(PAID_PLAN)) return showUpgradeToast()
    if (!group) return
    setDeleteError(undefined)
    startTransition(async () => {
      try {
        const result = await deleteGroupChat(group.id)
        if (result.error) {
          if (result.error === BILLING_ERROR) showUpgradeToast()
          setDeleteError(result.error)
          return
        }
        setConfirmDelete(false)
        setOpen(false)
        toast.add({ title: "Group chat deleted.", type: "success" })
        router.push("/")
      } catch {
        setDeleteError("Could not delete the group. Please try again.")
      }
    })
  }
  function onSubmit(values: CreateGroupChatInput) {
    if (!has?.(PAID_PLAN)) return showUpgradeToast()
    form.clearErrors("root")
    startTransition(async () => {
      try {
        const result = group
          ? await updateGroupChat(group.id, values)
          : await createGroupChat(values)
        if (result.error) {
          if (result.error === BILLING_ERROR) showUpgradeToast()
          form.setError("root", { message: result.error })
          return
        }
        setOpen(false)
        form.reset()
        toast.add({
          title: group ? "Group chat updated." : "Group chat created.",
          type: "success",
        })
        if ("chatId" in result && result.chatId)
          router.push(`/chats/${result.chatId}`)
      } catch {
        form.setError("root", {
          message: `Could not ${group ? "update" : "create"} the group. Please try again.`,
        })
      }
    })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return
        if (value && !has?.(PAID_PLAN)) return showUpgradeToast()
        setOpen(value)
        form.reset(group ?? { name: "", botIds: [] })
      }}
    >
      {children}
      <DialogContent
        showCloseButton={!pending}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>
            {group ? "Edit group chat" : "New group chat"}
          </DialogTitle>
          <DialogDescription>
            Name the group and pick which bots are in it.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="group-name"
                    placeholder="Weekend plans"
                    maxLength={100}
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? "group-name-error" : undefined
                    }
                  />
                  <FieldError
                    id="group-name-error"
                    errors={[fieldState.error]}
                  />
                </Field>
              )}
            />
            <Controller
              name="botIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <span id="group-bots-label" className="text-sm font-medium">
                    Bots
                  </span>
                  <div
                    role="group"
                    aria-labelledby="group-bots-label"
                    className="flex flex-col gap-3"
                  >
                    {bots.map((bot) => (
                      <FieldLabel
                        key={bot.id}
                        htmlFor={`group-bot-${bot.id}`}
                        className="flex items-center gap-3"
                      >
                        <Checkbox
                          id={`group-bot-${bot.id}`}
                          checked={field.value.includes(bot.id)}
                          disabled={pending}
                          onBlur={field.onBlur}
                          aria-invalid={fieldState.invalid}
                          aria-describedby={
                            fieldState.invalid ? "group-bots-error" : undefined
                          }
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, bot.id]
                                : field.value.filter((id) => id !== bot.id)
                            )
                          }
                        />
                        <ChatAvatar seed={bot.avatar} className="size-6" />
                        {bot.name}
                      </FieldLabel>
                    ))}
                    {bots.length < 2 && (
                      <p className="text-sm text-muted-foreground">
                        Create at least two bots to start a group chat.
                      </p>
                    )}
                  </div>
                  <FieldError
                    id="group-bots-error"
                    errors={[fieldState.error]}
                  />
                </Field>
              )}
            />
          </FieldGroup>
          <FieldError errors={[form.formState.errors.root]} />
          <DialogFooter>
            {group && (
              <AlertDialog
                open={confirmDelete}
                onOpenChange={(value) => {
                  if (pending) return
                  setDeleteError(undefined)
                  setConfirmDelete(value)
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
                  Delete group
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the group chat. Your bots remain.
                      This cannot be undone.
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
                      {pending ? "Deleting…" : "Delete group"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <DialogClose
              render={<Button variant="outline" disabled={pending} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending || selected.length < 2}>
              {group
                ? pending
                  ? "Saving…"
                  : "Save changes"
                : pending
                  ? "Creating…"
                  : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
