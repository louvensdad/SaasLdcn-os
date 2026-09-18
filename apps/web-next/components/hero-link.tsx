'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type ComponentProps } from 'react';

import { heroNavigate } from '@/lib/motion/hero';

/** Navigation that carries the chosen element into the next place's title when motion allows; a plain push otherwise. */
export function useHeroPush() {
  const router = useRouter();
  return useCallback((href: string, from: HTMLElement | null | undefined) => {
    if (!heroNavigate(from, href, () => router.push(href))) router.push(href);
  }, [router]);
}

/**
 * A link whose chosen element travels into the title of the place it opens (motion spec §6). `hero` names that element
 * when it is not the link itself. A modified click (new tab, new window) keeps the browser's own behaviour.
 */
export function HeroLink({ href, hero, onClick, ...rest }: Omit<ComponentProps<typeof Link>, 'href'> & {
  readonly href: string;
  readonly hero?: (link: HTMLAnchorElement) => HTMLElement | null | undefined;
}) {
  const router = useRouter();
  return (
    <Link
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.currentTarget;
        const from = hero ? hero(link) : link;
        if (heroNavigate(from, href, () => router.push(href))) event.preventDefault();
      }}
    />
  );
}
