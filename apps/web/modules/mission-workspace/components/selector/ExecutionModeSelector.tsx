import type { ExecutionMode, MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { modeMeta } from './config';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function ExecutionModeSelector({ genome }: { genome: MissionGenome }) {
  const selected=useWorkspaceDraftStore((s)=>s.executionMode); const setMode=useWorkspaceDraftStore((s)=>s.setExecutionMode);
  return <Panel id="modes" title="MODOS DE EXECUÇÃO"><fieldset className={styles.modes}><legend className="sr-only">Selecione o modo de execução</legend>{genome.executionModes.map((mode)=>{const meta=modeMeta[mode];const Icon=meta.icon;return <label key={mode} data-selected={mode===selected}><input type="radio" name="execution-mode" value={mode} checked={mode===selected} onChange={()=>setMode(mode as ExecutionMode)}/><span className={styles.modeIcon} data-tone={meta.tone}><Icon aria-hidden="true"/></span><span><strong>{meta.label}</strong><small>{meta.description}</small></span></label>})}</fieldset></Panel>;
}
