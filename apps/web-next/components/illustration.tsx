import type { ReactNode } from 'react';

/**
 * Technical line drawings for states a screen cannot fill: one idea each, drawn in the ink of the page, with one
 * accent line. They never stand in for data — a drawing next to an empty state names the kind of emptiness.
 */
export type IllustrationName =
  | 'project' | 'mission' | 'agents' | 'evidence' | 'runtime' | 'provider' | 'completed'
  | 'gap' | 'unreachable' | 'lock' | 'notfound' | 'failed' | 'stale';

const DRAWINGS: Readonly<Record<IllustrationName, ReactNode>> = {
  project: <><rect className="fill" x="44" y="26" width="80" height="62" rx="10" /><path className="ln-2" d="M58 44h52M58 56h36M58 68h44" /><circle className="acc" cx="124" cy="88" r="13" /><path className="acc" d="M124 82v12M118 88h12" /></>,
  mission: <><circle className="ln" cx="30" cy="30" r="7" /><path className="ln" d="M30 37v26a10 10 0 0 0 10 10h24" /><circle className="ln-2" cx="80" cy="73" r="7" /><circle className="ln-2" cx="110" cy="73" r="7" /><path className="ln-2" d="M87 73h16M117 73h13" /><path className="acc" d="M142 64l9 9-9 9-9-9z" /></>,
  agents: <><rect className="ln" x="66" y="16" width="36" height="24" rx="6" /><path className="ln" d="M84 40v14M40 54h88M40 54v10M84 54v10M128 54v10" /><rect className="ln-2" x="22" y="66" width="36" height="24" rx="6" /><rect className="ln-2" x="66" y="66" width="36" height="24" rx="6" /><rect className="ln-2" x="110" y="66" width="36" height="24" rx="6" /><path className="acc" d="M84 100v8M80 104h8" /></>,
  evidence: <><path className="fill" d="M52 18h44l20 20v64H52z" /><path className="ln" d="M96 18v20h20" /><circle className="ln-2" cx="84" cy="70" r="16" /><path className="acc" d="M77 70l5 5 9-10" /><path className="ln-2" d="M64 38h20" /></>,
  runtime: <><rect className="ln-2" x="16" y="42" width="36" height="30" rx="6" /><rect className="ln-2" x="66" y="42" width="36" height="30" rx="6" /><rect className="ln-2" x="116" y="42" width="36" height="30" rx="6" /><path className="ln-2" d="M52 57h14M102 57h14" /><circle className="acc" cx="84" cy="98" r="10" /><path className="acc" d="M84 88v10" /></>,
  provider: <><path className="ln" d="M24 60h34M58 46h16v28H58zM74 52h8M74 68h8" /><path className="ln" d="M144 60h-34M110 46H94v28h16z" /><path className="acc" d="M84 44l-4 8h8l-4 8" /><path className="ln-2" d="M90 60h-2M80 60h-2" /></>,
  completed: <><circle className="ln" cx="26" cy="28" r="6" /><path className="ln" d="M26 34v34a10 10 0 0 0 10 10h58" /><path className="acc" d="M122 60l18 18-18 18-18-18z" /><path className="acc" d="M114 78l6 6 10-11" /></>,
  gap: <><rect className="fill" x="30" y="30" width="30" height="30" rx="5" /><rect className="fill" x="64" y="30" width="30" height="30" rx="5" /><rect className="fill" x="30" y="64" width="30" height="30" rx="5" /><rect className="ln-2" x="64" y="64" width="30" height="30" rx="5" /><path className="acc" d="M112 79h28M126 65v28" /></>,
  unreachable: <><rect className="ln" x="18" y="42" width="44" height="34" rx="7" /><rect className="ln" x="106" y="42" width="44" height="34" rx="7" /><path className="ln" d="M62 59h14" /><path className="ln" d="M92 59h14" /><path className="acc" d="M78 51l12 16M90 51l-12 16" /></>,
  lock: <><rect className="fill" x="56" y="50" width="56" height="44" rx="8" /><path className="ln" d="M66 50V38a18 18 0 0 1 36 0v12" /><circle className="acc" cx="84" cy="70" r="5" /><path className="acc" d="M84 75v8" /></>,
  notfound: <><circle className="ln" cx="74" cy="54" r="24" /><path className="ln" d="M91 71l20 20" /><path className="ln-2" d="M64 54h20" /><path className="acc" d="M122 30l6 6M128 30l-6 6" /></>,
  failed: <><circle className="ln" cx="26" cy="28" r="6" /><path className="ln" d="M26 34v34a10 10 0 0 0 10 10h34" /><rect className="acc-fault" x="74" y="66" width="24" height="24" rx="5" /><path className="ln-2" d="M104 78h40" /></>,
  stale: <><circle className="ln" cx="84" cy="60" r="32" /><path className="ln" d="M84 40v20l14 9" /><path className="acc" d="M128 24v14h-14" /></>,
};

export function Illustration({ name, className }: { readonly name: IllustrationName; readonly className?: string }) {
  return (
    <svg className={`illo${className ? ` ${className}` : ''}`} viewBox="0 0 168 120" aria-hidden="true" focusable="false">
      {DRAWINGS[name]}
    </svg>
  );
}
