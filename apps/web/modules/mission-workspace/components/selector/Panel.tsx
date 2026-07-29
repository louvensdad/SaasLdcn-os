import { ChevronDown, Focus } from 'lucide-react';
import { useWorkspaceDraftStore, type WorkspacePanelId } from '../../stores/workspaceDraftStore';
import styles from '../MissionSelector.module.css';

export function Panel({ id, title, className = '', children, onFocus }: { id: WorkspacePanelId; title: React.ReactNode; className?: string; children: React.ReactNode; onFocus?: () => void }) {
  const collapsed = useWorkspaceDraftStore((state) => Boolean(state.collapsedPanels[id]));
  const toggle = useWorkspaceDraftStore((state) => state.togglePanel);
  return <section className={`${styles.panel} ${className}`} data-collapsed={collapsed}>
    <header className={styles.panelHeader}><h2 className={styles.panelTitle}>{title}</h2><span className={styles.panelControls}>{onFocus ? <button type="button" onClick={onFocus} aria-label={`Focar painel ${id}`}><Focus aria-hidden="true" /></button> : null}<button type="button" onClick={() => toggle(id)} aria-expanded={!collapsed} aria-controls={`panel-${id}`} aria-label={`${collapsed ? 'Expandir' : 'Recolher'} painel ${id}`}><ChevronDown aria-hidden="true" data-collapsed={collapsed} /></button></span></header>
    <div id={`panel-${id}`} hidden={collapsed}>{children}</div>
  </section>;
}
