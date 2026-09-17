import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SignInScreen } from './signin-screen';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInScreen />
    </Suspense>
  );
}
