'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { BlueprintResponseDiagnostics } from '@contracts/architecture-blueprint.contract';
import {
  EngineeringBadge,
  EngineeringChips,
  EngineeringCode,
  EngineeringLabel,
  EngineeringMetadata,
  EngineeringParagraph,
} from '@/components/engineering/ds';

/**
 * "Visualizar resposta da IA" (Phase 8): shows what the provider actually
 * returned, how the resilient pipeline parsed/normalized/repaired it, and any
 * partial-recovery reason — so a format difference is transparent, never a bare
 * "Blueprint inválido". The raw excerpt is already redacted server-side.
 *
 * Reference conversion to the Engineering Design System: no inline font-size,
 * no legacy scale — every text token comes from the shared components.
 */
export function BlueprintResponseViewer({ diagnostics }: { readonly diagnostics: BlueprintResponseDiagnostics }) {
  const raw = diagnostics.raw_record?.raw_excerpt || diagnostics.raw_excerpt || '—';
  return (
    <div className="space-y-5">
      <EngineeringChips>
        {diagnostics.partial ? (
          <EngineeringBadge tone="warning" icon={AlertTriangle}>Blueprint parcialmente gerado</EngineeringBadge>
        ) : (
          <EngineeringBadge tone="success" icon={CheckCircle2}>Blueprint completo</EngineeringBadge>
        )}
        {diagnostics.recovered ? <EngineeringBadge tone="accent">Recuperado</EngineeringBadge> : null}
        {diagnostics.raw_record?.provider ? (
          <EngineeringBadge>
            {diagnostics.raw_record.provider}
            {diagnostics.raw_record.model ? ` · ${diagnostics.raw_record.model}` : ''}
          </EngineeringBadge>
        ) : null}
      </EngineeringChips>

      <EngineeringParagraph>{diagnostics.reason}</EngineeringParagraph>

      <EngineeringMetadata
        items={[
          { label: 'Extractor', value: diagnostics.extractor_used },
          { label: 'Normalizer', value: diagnostics.normalizer_used },
          { label: 'Parser', value: diagnostics.parser_used },
          { label: 'Decisões', value: diagnostics.decisions_found },
        ]}
      />

      {diagnostics.areas_present.length > 0 ? (
        <div className="space-y-1.5">
          <EngineeringLabel>Áreas presentes</EngineeringLabel>
          <EngineeringChips>
            {diagnostics.areas_present.map((a) => <EngineeringBadge key={a} tone="success">{a}</EngineeringBadge>)}
          </EngineeringChips>
        </div>
      ) : null}

      {diagnostics.areas_missing.length > 0 ? (
        <div className="space-y-1.5">
          <EngineeringLabel>Áreas ausentes (completadas/pendentes)</EngineeringLabel>
          <EngineeringChips>
            {diagnostics.areas_missing.map((a) => <EngineeringBadge key={a} tone="neutral">{a}</EngineeringBadge>)}
          </EngineeringChips>
        </div>
      ) : null}

      {diagnostics.repaired_fields.length > 0 ? (
        <p className="ds-caption">Campos auto-reparados: {diagnostics.repaired_fields.join(', ')}</p>
      ) : null}

      <div className="space-y-1.5">
        <EngineeringLabel>Resposta bruta da IA (redigida)</EngineeringLabel>
        <EngineeringCode code={raw} language="raw" collapsible />
      </div>
    </div>
  );
}
