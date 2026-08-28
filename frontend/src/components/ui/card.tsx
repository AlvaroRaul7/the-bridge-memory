import type * as React from 'react'
import { cn } from '@/lib/utils'

const Card = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn(
      'rounded-xl border border-border bg-card text-card-foreground shadow-xs',
      className,
    )}
    {...props}
  />
)

const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />
)

const CardTitle = ({ className, ...props }: React.ComponentProps<'h3'>) => (
  <h3
    className={cn('text-sm font-semibold tracking-tight', className)}
    {...props}
  />
)

const CardDescription = ({ className, ...props }: React.ComponentProps<'p'>) => (
  <p className={cn('text-[13px] text-muted-foreground', className)} {...props} />
)

const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
)

const CardFooter = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('flex items-center p-5 pt-0', className)} {...props} />
)

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
