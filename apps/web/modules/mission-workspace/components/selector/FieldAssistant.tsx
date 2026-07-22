import { Loader2, LockKeyhole, Sparkles } from 'lucide-react';
import type { MissionGenome } from '../../types';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function FieldAssistant({ genome }: { genome: MissionGenome }) {
  const llm=useActiveLlm(); const run=useWorkspaceDraftStore((s)=>s.runAssistant); const open=useWorkspaceDraftStore((s)=>s.openDetail); const loading=useWorkspaceDraftStore((s)=>s.assistantDraft?.loading??false);
  const entries=genome.steps.flatMap((step)=>step.fields.filter((field)=>field.aiActions.length).map((field)=>({step,field}))).slice(0,2);
  async function execute(step: typeof entries[number]['step'],field:typeof entries[number]['field'],action:typeof field.aiActions[number]) { if(!llm.isReady||!llm.model){open({kind:'ai-required'});return;} const resolution=await llm.confirmUse('mission_field_action','llm'); if(resolution.mode!=='llm'||!resolution.model){open({kind:'ai-required'});return;} await run(step,field,action,resolution.model); }
  return <Panel id="assistant" title={<>ASSISTÊNCIA POR<br/>CAMPO</>}><div className={styles.fieldCards}>{entries.map(({step,field},index)=><article key={`${step.id}.${field.id}`} data-tone={index?'blue':'violet'}><h3>{field.label}</h3><div>{field.aiActions.slice(0,6).map((action)=><button type="button" key={action.id} disabled={loading||llm.isConfirming} onClick={()=>void execute(step,field,action)}>{loading?<Loader2 className={styles.spinner} aria-hidden="true"/>:llm.isReady?<Sparkles aria-hidden="true"/>:<LockKeyhole aria-hidden="true"/>}{action.label}</button>)}</div></article>)}</div>{!llm.isReady?<button type="button" className={styles.inlineAction} onClick={()=>llm.openProviderSettings()}>Conectar IA</button>:null}</Panel>;
}
