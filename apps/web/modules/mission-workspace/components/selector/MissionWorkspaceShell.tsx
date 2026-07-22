'use client';
import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import { getMissionGenome, isRegisteredMissionType } from '../../registry';
import { stepsForMode, useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import type { MissionTypeId } from '../../types';
import { MissionCategoryList } from './MissionCategoryList';
import { MissionGenome } from './MissionGenome';
import { MissionContextPanel } from './MissionContextPanel';
import { AdaptiveJourney } from './AdaptiveJourney';
import { SpecialistCouncil } from './SpecialistCouncil';
import { FieldAssistant } from './FieldAssistant';
import { ExecutionModeSelector } from './ExecutionModeSelector';
import { RiskDetector } from './RiskDetector';
import { ContextInputSelector } from './ContextInputSelector';
import { ArtifactFactory } from './ArtifactFactory';
import { MissionPrimaryAction } from './MissionPrimaryAction';
import { MissionDetailsDrawer } from './MissionDetailsDrawer';
import styles from '../MissionSelector.module.css';

export function MissionWorkspaceShell() {
  const router=useRouter(); const search=useSearchParams();
  const selected=useWorkspaceDraftStore((s)=>s.selectedMissionId); const select=useWorkspaceDraftStore((s)=>s.selectMission); const mode=useWorkspaceDraftStore((s)=>s.executionMode); const hydrated=useWorkspaceDraftStore((s)=>s.hydrated); const saveStatus=useWorkspaceDraftStore((s)=>s.saveStatus); const error=useWorkspaceDraftStore((s)=>s.error); const notice=useWorkspaceDraftStore((s)=>s.notice); const clear=useWorkspaceDraftStore((s)=>s.clearFeedback);
  const queryType=search.get('type');
  useEffect(()=>{if(!hydrated)return;if(queryType&&isRegisteredMissionType(queryType)&&queryType!==selected){select(queryType);return;}if(!queryType)router.replace(`/wizard?type=${selected}`,{scroll:false});},[hydrated,queryType,router,select,selected]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(clear,4200);return()=>clearTimeout(timer);},[clear,notice]);
  const genome=getMissionGenome(selected);
  const visibleSteps=useMemo(()=>genome?stepsForMode(genome.id,mode):[],[genome,mode]);
  function choose(id:MissionTypeId){select(id);router.push(`/wizard?type=${id}`,{scroll:false});}
  if(!hydrated||!genome)return <main className={styles.workspace}><div className={styles.loadingState}><Loader2 className={styles.spinner} aria-hidden="true"/>Restaurando Mission Workspace…</div></main>;
  return <main className={styles.workspace}>
    <header className={styles.header}><div><h1>LDCN OS — MISSION WORKSPACE</h1><p>Ambiente universal de execução guiada · /wizard → /mission</p></div><div className={styles.saveIndicator} data-status={saveStatus} role="status" aria-live="polite"><Save aria-hidden="true"/>{saveStatus==='saving'?'Salvando…':saveStatus==='error'?'Falha no autosave':'Autosave ativo'}</div></header>
    <div className={styles.feedbackRegion} aria-live="polite">{error?<p role="alert" data-tone="red"><XCircle aria-hidden="true"/>{error}</p>:notice?<p data-tone="green"><CheckCircle2 aria-hidden="true"/>{notice}</p>:null}</div>
    <div className={styles.board}><MissionCategoryList selected={selected} onSelect={choose}/><section className={styles.coreGrid} aria-label="Configuração da missão"><MissionGenome genome={genome} visibleStepCount={visibleSteps.length}/><MissionContextPanel genome={genome}/><AdaptiveJourney/><SpecialistCouncil genome={genome}/><FieldAssistant genome={genome}/><ArtifactFactory genome={genome}/></section><aside className={styles.contextRail}><ExecutionModeSelector genome={genome}/><RiskDetector genome={genome}/><ContextInputSelector genome={genome}/><MissionPrimaryAction genome={genome}/></aside></div>
    <MissionDetailsDrawer genome={genome}/>
  </main>;
}
