import { CheckCircle2 } from 'lucide-react';
import type { MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function RiskDetector({ genome }: { genome: MissionGenome }) {
  const states=useWorkspaceDraftStore((s)=>s.riskStates); const open=useWorkspaceDraftStore((s)=>s.openDetail); const rules=[...genome.riskRules,...genome.gapRules].slice(0,4);
  return <Panel id="risks" title="DETECTOR DE RISCOS"><div className={styles.risks}>{rules.length?rules.map((rule,index)=>{const status=states[rule.id]??'open';return <button type="button" key={rule.id} onClick={()=>open({kind:'risk',id:rule.id})} data-resolved={status!=='open'}><i data-tone={['red','amber','green','cyan'][index%4]}/><span><strong>{rule.title}</strong><small>{status==='open'?rule.suggestedAction:status==='reviewed'?'Em revisão':'Mantido com justificativa'}</small></span>{status!=='open'?<CheckCircle2 aria-hidden="true"/>:null}</button>}) : <p className={styles.emptyState}><CheckCircle2 aria-hidden="true"/>A análise contínua assumirá a detecção.</p>}</div></Panel>;
}
