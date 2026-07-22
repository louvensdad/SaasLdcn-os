import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActiveLlm } from '@/hooks/use-active-llm';
import type { MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import styles from '../MissionSelector.module.css';

const requiresAI = new Set(['guided','quick','analysis','collaborative','autonomous','learning']);
export function MissionPrimaryAction({ genome }: { genome: MissionGenome }) {
  const router=useRouter(); const llm=useActiveLlm(); const objective=useWorkspaceDraftStore((s)=>s.objective); const mode=useWorkspaceDraftStore((s)=>s.executionMode); const starting=useWorkspaceDraftStore((s)=>s.isStarting); const start=useWorkspaceDraftStore((s)=>s.startMission); const open=useWorkspaceDraftStore((s)=>s.openDetail);
  const needsAI=requiresAI.has(mode); const label=!objective.trim()?'Definir contexto':needsAI&&!llm.isReady?'Conectar IA':genome.primaryActionLabel??`Iniciar ${genome.title.toLowerCase()}`;
  async function handle(){if(!objective.trim()){open({kind:'objective'});return;}if(needsAI&&!llm.isReady){open({kind:'ai-required'});return;}try{const created=await start(llm.isReady);router.push(`/wizard/${created.id}`);}catch{/* Store surfaces a specific recovery message. */}}
  return <button type="button" className={styles.primaryAction} onClick={()=>void handle()} disabled={starting} aria-busy={starting}>{starting?<Loader2 className={styles.spinner} aria-hidden="true"/>:<Sparkles aria-hidden="true"/>}{starting?'Criando missão…':label}</button>;
}
