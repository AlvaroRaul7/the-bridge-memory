import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value
const SelectGroup = SelectPrimitive.Group

const SelectTrigger = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) => (
  <SelectPrimitive.Trigger
    className={cn(
      'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-[13px] whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-3.5 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
)

const SelectContent = ({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      position={position}
      className={cn(
        'relative z-50 max-h-96 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        position === 'popper' && 'data-[side=bottom]:translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn('p-1', position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]')}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
)

const SelectItem = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) => (
  <SelectPrimitive.Item
    className={cn(
      'relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-2 pl-7 text-[13px] outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
)

const SelectLabel = ({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) => (
  <SelectPrimitive.Label
    className={cn('px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase', className)}
    {...props}
  />
)

const SelectSeparator = ({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) => (
  <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
)

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
}
