import type * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = ({ className, ...props }: React.ComponentProps<'textarea'>) => (
  <textarea
    className={cn(
      'flex min-h-[60px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
)

export { Textarea }
