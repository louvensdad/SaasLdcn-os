import dynamic from 'next/dynamic';

const MissionSelector = dynamic(() => import('@/modules/mission-workspace/components/MissionSelector').then((module) => module.MissionSelector), { loading: () => <div className="p-8 text-[color:var(--muted)]">Carregando missoes...</div> });
export default function MissionsPage() { return <MissionSelector/>; }
