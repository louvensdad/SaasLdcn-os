import type { ReactNode } from 'react'

interface BadgeProps {
  variant?: 'online' | 'offline' | 'admin' | 'success' | 'failure' | 'info'
  children: ReactNode
}

export function Badge({ variant = 'info', children }: BadgeProps) {
  const variantStyles = {
    online: 'badge-online',
    offline: 'badge-offline',
    admin: 'badge-admin',
    success: 'bg-secondary/20 text-secondary text-caption font-medium px-sm py-0.5 rounded-full',
    failure: 'bg-error/20 text-error text-caption font-medium px-sm py-0.5 rounded-full',
    info: 'bg-primary/20 text-primary text-caption font-medium px-sm py-0.5 rounded-full',
  }
  return <span className={variantStyles[variant]}>{children}</span>
}