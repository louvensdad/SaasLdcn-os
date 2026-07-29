import { Check } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { MissionTypeId } from '../../types';
import { missionGroups } from './config';
import styles from '../MissionSelector.module.css';

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
export function MissionCategoryList({ selected, onSelect }: { selected: MissionTypeId; onSelect: (id: MissionTypeId) => void }) {
  return <aside className={styles.missionRail} aria-label="Tipos de missão">{missionGroups.map((group) => <section className={styles.panel} key={group.label}><h2 className={styles.sectionTitle} data-tone={group.tone}>{group.label}</h2><div className={styles.missionList} role="listbox" aria-label={`Missões para ${group.label}`} onKeyDown={moveFocus}>{group.items.map((item) => { const active = item.type === selected; return <button key={item.type} type="button" role="option" aria-selected={active} className={styles.missionItem} data-selected={active} onClick={() => onSelect(item.type)}><span>{item.label}</span>{active ? <Check aria-hidden="true" /> : null}</button>; })}</div></section>)}</aside>;
}
