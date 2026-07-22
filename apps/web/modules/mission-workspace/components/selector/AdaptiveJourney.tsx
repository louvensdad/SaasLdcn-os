import { AlertTriangle, Check } from 'lucide-react';
import { journeyForDraft, stepsForMode, useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function AdaptiveJourney() {
  const selectedMissionId=useWorkspaceDraftStore((s)=>s.selectedMissionId); const executionMode=useWorkspaceDraftStore((s)=>s.executionMode); const currentStepId=useWorkspaceDraftStore((s)=>s.currentStepId); const objective=useWorkspaceDraftStore((s)=>s.objective); const go=useWorkspaceDraftStore((s)=>s.goToStep);
  const steps=stepsForMode(selectedMissionId,executionMode); const journey=journeyForDraft({selectedMissionId,executionMode,currentStepId,objective});
  return <Panel id="journey" title="JORNADA ADAPTATIVA — DINÂMICA POR TIPO DE MISSÃO" className={styles.journey}><ol aria-label={`Jornada com ${steps.length} etapas`}>{steps.map((step,index)=>{const state=journey.steps[index];return <li key={step.id} data-status={state?.status}><button type="button" onClick={()=>go(step.id)} aria-current={state?.status==='active'?'step':undefined} aria-label={`${step.title}: ${state?.status ?? 'pending'}`} title={`${step.description} Status: ${state?.status}`}><span className={styles.stepDot}>{state?.status==='completed'?<Check aria-hidden="true"/>:state?.status==='blocked'?<AlertTriangle aria-hidden="true"/>:null}</span><small>{step.title}</small></button></li>})}</ol><p className={styles.journeyProgress} aria-live="polite">{journey.progress}% concluído · modo {executionMode}</p></Panel>;
}
