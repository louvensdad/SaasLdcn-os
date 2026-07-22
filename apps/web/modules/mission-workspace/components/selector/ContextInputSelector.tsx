import type { MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { inputMeta } from './config';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function ContextInputSelector({ genome }: { genome: MissionGenome }) {
  const selected=useWorkspaceDraftStore((s)=>s.selectedContextSources); const choose=useWorkspaceDraftStore((s)=>s.selectContextSource); const remove=useWorkspaceDraftStore((s)=>s.deselectContextSource);
  return <Panel id="inputs" title="ENTRADA DE CONTEXTO"><div className={styles.inputs}>{genome.inputTypes.map((input)=>{const meta=inputMeta[input];const Icon=meta.icon;const active=selected.includes(input);return <div key={input}><button type="button" aria-pressed={active} data-selected={active} data-tone={meta.tone} onClick={()=>choose(input)}><Icon aria-hidden="true"/><span>{meta.label}</span></button>{active?<button type="button" className={styles.removeInput} onClick={()=>remove(input)} aria-label={`Remover ${meta.label}`}>×</button>:null}</div>})}</div>{selected.length?<p className={styles.panelFoot}>{selected.length} fonte(s) na Central de Contexto.</p>:null}</Panel>;
}
