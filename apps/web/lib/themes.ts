export type ThemeId = 'dark' | 'light';

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly name: string;
  readonly accent: string;
  readonly accentSecondary: string;
  readonly description: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Dark',
    accent: '#a78bfa',
    accentSecondary: '#22b8c7',
    description: 'Aubergine instrument surfaces with an ultraviolet operational signal.',
  },
  {
    id: 'light',
    name: 'Light',
    accent: '#6d28d9',
    accentSecondary: '#087f8c',
    description: 'Cool drafting surfaces with a high-contrast ultraviolet signal.',
  },
] as const;

export const DEFAULT_THEME_ID: ThemeId = 'dark';

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
