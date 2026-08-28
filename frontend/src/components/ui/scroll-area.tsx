import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const ScrollArea = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) => (
  <ScrollAreaPrimitive.Root
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      className="flex w-2 touch-none select-none p-0.5 transition-colors"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
)

export { ScrollArea }
