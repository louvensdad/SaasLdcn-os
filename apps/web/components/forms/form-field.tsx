import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { InlineError } from '@/components/feedback/error-system';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';

interface FieldShellProps {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
  readonly children: ReactNode;
}

export function FieldShell({ label, description, error, children }: FieldShellProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[color:var(--text)]">{label}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{description}</span> : null}
      <span className="mt-2 block">{children}</span>
      {error ? <InlineError>{error}</InlineError> : null}
    </label>
  );
}

export function TextField({
  label,
  description,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}) {
  return (
    <FieldShell label={label} description={description} error={error}>
      <Input aria-invalid={Boolean(error)} {...props} />
    </FieldShell>
  );
}

export function TextareaField({
  label,
  description,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}) {
  return (
    <FieldShell label={label} description={description} error={error}>
      <textarea
        className={cn(
          'focus-ring min-h-28 w-full resize-y rounded-2xl border border-[color:var(--border)] bg-white/5 px-4 py-3 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none transition duration-200',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  description,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  readonly label: string;
  readonly description?: string;
  readonly error?: string;
}) {
  return (
    <FieldShell label={label} description={description} error={error}>
      <Select aria-invalid={Boolean(error)} {...props}>
        {children}
      </Select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly description?: string;
}) {
  const id = useId();

  return (
    <div className="pointer-events-none flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-white/5 p-3">
      <input id={id} type="checkbox" className="pointer-events-auto mt-1 accent-[color:var(--accent)]" {...props} />
      <label htmlFor={id} className="pointer-events-auto cursor-pointer">
        <span className="block text-sm font-semibold text-[color:var(--text)]">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{description}</span> : null}
      </label>
    </div>
  );
}

export function RadioField({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly label: string;
  readonly description?: string;
}) {
  const id = useId();

  return (
    <div className="pointer-events-none flex items-start gap-3 rounded-2xl border border-[color:var(--border)] bg-white/5 p-3">
      <input id={id} type="radio" className="pointer-events-auto mt-1 accent-[color:var(--accent)]" {...props} />
      <label htmlFor={id} className="pointer-events-auto cursor-pointer">
        <span className="block text-sm font-semibold text-[color:var(--text)]">{label}</span>
        {description ? <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{description}</span> : null}
      </label>
    </div>
  );
}

export function SwitchField({
  label,
  description,
  checked,
}: {
  readonly label: string;
  readonly description?: string;
  readonly checked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-white/5 p-3">
      <div>
        <p className="text-sm font-semibold text-[color:var(--text)]">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        className={cn(
          'focus-ring h-7 w-12 rounded-full border p-1 transition duration-200',
          checked
            ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]'
            : 'border-[color:var(--border)] bg-white/5',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-[color:var(--text)] transition duration-200',
            checked && 'translate-x-5 bg-[color:var(--accent)]',
          )}
        />
      </button>
    </div>
  );
}
