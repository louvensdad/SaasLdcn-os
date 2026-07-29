import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormat = '24h' | '12h';

export interface PersonalPreferencesState {
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly timeFormat: TimeFormat;
  readonly emailNotifications: boolean;
  readonly weeklySummary: boolean;
  setTimezone: (timezone: string) => void;
  setDateFormat: (dateFormat: DateFormat) => void;
  setTimeFormat: (timeFormat: TimeFormat) => void;
  setEmailNotifications: (value: boolean) => void;
  setWeeklySummary: (value: boolean) => void;
  importAll: (snapshot: Partial<Pick<PersonalPreferencesState, 'timezone' | 'dateFormat' | 'timeFormat' | 'emailNotifications' | 'weeklySummary'>>) => void;
}

/** Real, client-persisted personal preferences (Account tab). The notification
 * toggles below record a genuine, stored user choice, but note: no mailer
 * service exists in the backend yet, so nothing consumes them today -- they are
 * a persisted opt-in that a future email feature would honour, not proof that
 * emails are being sent. */
export const usePersonalPreferencesStore = create<PersonalPreferencesState>()(
  persist(
    (set) => ({
      timezone: 'UTC-03:00',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      emailNotifications: true,
      weeklySummary: true,
      setTimezone: (timezone) => set({ timezone }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setEmailNotifications: (emailNotifications) => set({ emailNotifications }),
      setWeeklySummary: (weeklySummary) => set({ weeklySummary }),
      importAll: (snapshot) => set(snapshot),
    }),
    { name: 'ldcn-personal-preferences-v1' },
  ),
);

export const TIMEZONE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'UTC-05:00', label: '(UTC-05:00) New York' },
  { value: 'UTC-03:00', label: '(UTC-03:00) Brasília' },
  { value: 'UTC+00:00', label: '(UTC+00:00) London' },
  { value: 'UTC+01:00', label: '(UTC+01:00) Paris' },
  { value: 'UTC+09:00', label: '(UTC+09:00) Tokyo' },
];
