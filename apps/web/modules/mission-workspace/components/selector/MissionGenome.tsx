import type { MissionGenome as Genome } from '../../types';
import { Panel } from './Panel';
import styles from '../MissionSelector.module.css';

export function MissionGenome({ genome, visibleStepCount }: { genome: Genome; visibleStepCount: number }) {
  const metrics = [
    ['Complexidade', genome.complexity * 10, 'violet'], ['Etapas', Math.min(100, visibleStepCount * 10), 'purple'],
    ['Contexto IA', Math.min(100, genome.inputTypes.length * 15), 'cyan'], ['Entregáveis', Math.min(100, genome.artifacts.length * 15), 'green'],
    ['Validações', Math.max(32, Math.min(100, (genome.gapRules.length + genome.riskRules.length + genome.validations.length) * 18)), 'amber'],
  ] as const;
  return <Panel id="genome" title={<>MISSION GENOME —<br />{genome.id.toUpperCase()}</>}><p className={styles.genomeDescription}>{genome.description}</p><div className={styles.metricList}>{metrics.map(([label,value,tone]) => <div className={styles.metric} key={label}><span>{label}</span><span className={styles.track} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i data-tone={tone} style={{width:`${value}%`}} /></span></div>)}</div><div className={styles.divider}/><div className={styles.tags}>{genome.knowledgeTopics.slice(0,7).map((tag,index)=><span key={tag} data-tone={['blue','purple','green','amber','cyan','pink','slate'][index%7]}>{tag.replaceAll('_',' ')}</span>)}</div></Panel>;
}
