import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-xl text-center">
      {icon && <div className="text-text-muted mb-md text-4xl">{icon}</div>}
      <h3 className="font-heading text-subheading text-text-primary mb-xs">{title}</h3>
      {description && <p className="text-text-secondary text-body mb-lg max-w-sm">{description}</p>}
      {action}
    </div>
  )
}