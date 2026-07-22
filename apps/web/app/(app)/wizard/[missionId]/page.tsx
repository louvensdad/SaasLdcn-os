'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
const MissionShell = dynamic(() => import('@/modules/mission-workspace/components/MissionShell').then((module) => module.MissionShell), { ssr: false, loading: () => <div className="p-8 text-[color:var(--muted)]">Montando o workspace...</div> });
export default function MissionWorkspacePage() { const { missionId } = useParams<{ missionId: string }>(); return <MissionShell missionId={missionId}/>; }
