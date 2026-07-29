import { Eye } from 'lucide-react';
import type { MissionGenome } from '../../types';
import { artifactStatus, useWorkspaceDraftStore } from '../../stores/workspaceDraftStore';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function ArtifactFactory({ genome }: { genome: MissionGenome }) {
  const viewed=useWorkspaceDraftStore((s)=>s.viewedArtifacts); const view=useWorkspaceDraftStore((s)=>s.viewArtifact);
  return <Panel id="artifacts" title="ARTIFACT FACTORY — ENTREGÁVEIS POR MISSÃO" className={styles.artifacts}><div>{genome.artifacts.map((artifact,index)=>{const status=artifactStatus(artifact.type,viewed);return <button type="button" key={`${artifact.type}-${index}`} onClick={()=>view(artifact.type)}><strong data-tone={['violet','cyan','amber','green'][index%4]}>{artifact.title.toUpperCase()}</strong><p>{artifact.type.replaceAll('_',' ')} · {artifact.format}</p><span><Eye aria-hidden="true"/>{status==='not_started'?'Ainda não iniciado':status==='previewed'?'Detalhes vistos':'Gerado'}</span></button>})}</div></Panel>;
}
