import type { Metadata } from 'next';

import { GuideScreen } from './guide-screen';

export const metadata: Metadata = { title: 'Guide' };

export default async function GuidePage({ params }: { readonly params: Promise<{ readonly guideId: string }> }) {
  const { guideId } = await params;
  return <GuideScreen guideId={guideId} />;
}
