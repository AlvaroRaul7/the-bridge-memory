import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StoredSession } from '@/lib/session-store'

/**
 * Spec 3: "a simple dropdown/select to create or switch between sessions
 * (POST /session, GET /session/{id}), so the classic demo — session 1 answer
 * vs. session 2 answer, same question — can be reproduced in the UI instead of
 * two terminal windows."
 *
 * The list comes from local storage, not the API: the backend has no
 * "sessions for this user with this assistant" query, so the client is the
 * only thing that knows. See lib/session-store.ts.
 */
export function SessionSwitcher({
  sessions,
  activeId,
  onSelect,
  onCreate,
  creating,
}: {
  sessions: StoredSession[]
  activeId?: string
  onSelect: (sessionId: string) => void
  onCreate: () => void
  creating: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <Select
        open={open}
        onOpenChange={setOpen}
        // Controlled from the first render: `undefined` here would make Radix
        // flip from uncontrolled to controlled once the session loads.
        value={activeId ?? ''}
        onValueChange={onSelect}
        disabled={sessions.length === 0}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="No conversation yet" />
        </SelectTrigger>
        <SelectContent>
          {/* Radix requires SelectLabel to live inside a SelectGroup. */}
          <SelectGroup>
            <SelectLabel>Conversations</SelectLabel>
            <SelectSeparator />
            {sessions.map((session) => (
              <SelectItem key={session.sessionId} value={session.sessionId}>
                {session.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={onCreate}
        disabled={creating}
        title="Start a fresh conversation. Everything remembered is kept."
      >
        <Plus />
        New conversation
      </Button>
    </div>
  )
}
