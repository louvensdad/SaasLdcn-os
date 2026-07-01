export type ThemeId =
  | 'engineering-runtime'
  | 'assembly-line'
  | 'obsidian-blue'
  | 'graphite-cyan'
  | 'titanium-violet'
  | 'emerald-matrix'
  | 'crimson-pulse';

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly name: string;
  readonly accent: string;
  readonly accentSecondary: string;
  readonly description: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'engineering-runtime',
    name: 'Engineering Runtime',
    accent: '#06b6d4',
    accentSecondary: '#3b82f6',
    description: 'Near-black navy, glass surfaces, cyan→electric-blue accent.',
  },
  {
    id: 'assembly-line',
    name: 'Assembly Line',
    accent: '#34e5a0',
    accentSecondary: '#57d6c8',
    description: 'Matte board-green with an emerald signal that runs the line.',
  },
  {
    id: 'obsidian-blue',
    name: 'Obsidian Blue',
    accent: '#7ba7ff',
    accentSecondary: '#65d6ff',
    description: 'Cold blue precision with deep obsidian surfaces.',
  },
  {
    id: 'graphite-cyan',
    name: 'Graphite Cyan',
    accent: '#67d9eb',
    accentSecondary: '#9df3ff',
    description: 'Graphite tones with a restrained cyan edge.',
  },
  {
    id: 'titanium-violet',
    name: 'Titanium Violet',
    accent: '#b69cff',
    accentSecondary: '#8fc6ff',
    description: 'Titanium depth with violet intelligence.',
  },
  {
    id: 'emerald-matrix',
    name: 'Emerald Matrix',
    accent: '#7cf0b9',
    accentSecondary: '#76c9ff',
    description: 'Emerald control with a calm operational glow.',
  },
  {
    id: 'crimson-pulse',
    name: 'Crimson Pulse',
    accent: '#ff8aa3',
    accentSecondary: '#f2ab62',
    description: 'A controlled crimson signal for higher urgency.',
  },
] as const;

export const DEFAULT_THEME_ID: ThemeId = 'engineering-runtime';

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
