import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

const SheetContent = ({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'right' | 'left'
}) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
    <SheetPrimitive.Content
      className={cn(
        'fixed inset-y-0 z-50 flex w-full flex-col border-border bg-background shadow-lg sm:max-w-lg',
        side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus:outline-none">
        <X className="size-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
)

const SheetHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn('flex flex-col gap-1 border-b border-border px-5 py-4', className)}
    {...props}
  />
)

const SheetTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) => (
  <SheetPrimitive.Title
    className={cn('text-sm font-semibold tracking-tight', className)}
    {...props}
  />
)

const SheetDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) => (
  <SheetPrimitive.Description
    className={cn('text-[12.5px] text-muted-foreground', className)}
    {...props}
  />
)

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
}
