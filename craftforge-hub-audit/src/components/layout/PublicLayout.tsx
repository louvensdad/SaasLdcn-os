import { Outlet } from 'react-router-dom'
import { GameController } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

export function PublicLayout() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-surface-alt flex flex-col">
      <header className="p-lg flex items-center gap-sm border-b border-border">
        <GameController size={28} className="text-primary" />
        <span className="font-heading text-subheading font-bold text-text-primary">GameHub Painel</span>
      </header>
      <main className="flex-1 flex items-center justify-center p-md">
        <Outlet />
      </main>
      <footer className="p-md text-center text-text-muted text-caption">
        GameHub Painel &copy; {new Date().getFullYear()}
      </footer>
    </div>
  )
}