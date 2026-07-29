import { Check, Info } from 'lucide-react';
import type { MissionGenome } from '../../types';
import { useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { specialistMeta } from './config';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function SpecialistCouncil({ genome }: { genome: MissionGenome }) {
  const active=useWorkspaceDraftStore((s)=>s.activeSpecialists); const toggle=useWorkspaceDraftStore((s)=>s.requestSpecialistToggle);
  return <Panel id="specialists" title={<>AI COUNCIL —<br/>ESPECIALISTAS ATIVOS</>}><div className={styles.specialists}>{genome.specialists.map((role,index)=>{const meta=specialistMeta[role]??{label:role.replaceAll('_',' '),tone:'slate',responsibilities:[]};const selected=active.includes(role);return <button type="button" key={role} aria-pressed={selected} data-selected={selected} onClick={()=>toggle(role)} title={`${meta.label}: ${meta.responsibilities.join(', ')}`}><i data-tone={meta.tone}/><span>{meta.label}{index===0?<small>Obrigatório</small>:null}</span>{selected?<Check aria-hidden="true"/>:<Info aria-hidden="true"/>}</button>})}</div><div className={styles.divider}/><p className={styles.panelFoot}>Selecione um especialista para ver responsabilidades. A remoção do especialista obrigatório exige confirmação.</p></Panel>;
}
