import type { MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function MissionContextPanel({ genome }: { genome: MissionGenome }) {
  const objective = useWorkspaceDraftStore((s)=>s.objective); const sources = useWorkspaceDraftStore((s)=>s.selectedContextSources); const risks = useWorkspaceDraftStore((s)=>s.riskStates); const lastSavedAt = useWorkspaceDraftStore((s)=>s.lastSavedAt); const open = useWorkspaceDraftStore((s)=>s.openDetail); const decisions = useWorkspaceDraftStore((s)=>Object.keys(s.fieldDrafts).length + Number(Boolean(s.objective)));
  return <Panel id="context" title="CONTEXT ENGINE"><p className={styles.panelLead}>Memória viva da missão — persiste e propaga decisões</p><dl className={styles.contextList}><div><dt>Objetivo</dt><dd data-tone="violet"><button type="button" onClick={()=>open({kind:'objective'})}>{objective.trim() ? 'Definido' : 'Ainda não definido'}</button></dd></div><div><dt>Missão</dt><dd data-tone="purple">{genome.title}</dd></div><div><dt>Decisões</dt><dd data-tone="purple">{decisions} registradas</dd></div><div><dt>Fontes</dt><dd data-tone="cyan">{sources.length} conectadas</dd></div><div><dt>Riscos tratados</dt><dd data-tone="amber">{Object.keys(risks).length}</dd></div><div><dt>Autosave</dt><dd data-tone="green">{lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : 'Ativo · 2s'}</dd></div></dl>{!objective.trim()?<button type="button" className={styles.inlineAction} onClick={()=>open({kind:'objective'})}>Definir objetivo</button>:null}</Panel>;
}
