'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/shell/section-header';
import {
  ArchitectureGraphSurface,
  DeploymentPathSurface,
  OperationalRail,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useLocale } from '@/hooks/use-locale';

const lifecycle = [
  'blueprint',
  'promptMaster',
  'gatekeeper',
  'registry',
  'readiness',
  'download',
] as const;

const knowledgeBlocks = [
  'architecture',
  'lifecycle',
  'quality',
  'standards',
  'dependencies',
  'phases',
] as const;

export default function DocumentationPage() {
  const { t } = useLocale();
  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('documentation.title')}
        description={t('documentation.description')}
      />

      <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
        <ArchitectureGraphSurface
          title={t('documentation.map.title')}
          subtitle={t('documentation.map.description')}
          nodes={[
            {
              label: t('documentation.map.blueprint'),
              value: t('documentation.map.blueprintValue'),
              detail: t('documentation.map.blueprintDetail'),
              tone: 'accent',
            },
            {
              label: t('documentation.map.promptMaster'),
              value: t('documentation.map.promptMasterValue'),
              detail: t('documentation.map.promptMasterDetail'),
              tone: 'accent2',
            },
            {
              label: t('documentation.map.gatekeeper'),
              value: t('documentation.map.gatekeeperValue'),
              detail: t('documentation.map.gatekeeperDetail'),
              tone: 'success',
            },
            {
              label: t('documentation.map.registry'),
              value: t('documentation.map.registryValue'),
              detail: t('documentation.map.registryDetail'),
              tone: 'muted',
            },
          ]}
        />

        <DeploymentPathSurface
          title={t('documentation.lifecycle.title')}
          steps={lifecycle.map((item, index) => ({
            label: t(`documentation.lifecycle.${item}`),
            detail: t(`documentation.lifecycle.${item}Detail`),
            tone:
              index === 2
                ? 'warning'
                : index === 4
                  ? 'success'
                  : index === 5
                    ? 'accent2'
                    : 'accent',
          }))}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {knowledgeBlocks.map((block) => (
            <Card key={block} className="space-y-4 p-5">
              <Badge>{t(`documentation.block.${block}`)}</Badge>
              <p className="text-sm leading-6 text-[color:var(--muted)]">{t(`documentation.block.${block}Detail`)}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4">
          <OperationalRail
            title={t('documentation.quality.title')}
            items={[
              {
                label: t('documentation.quality.validation'),
                value: t('documentation.quality.explicit'),
                detail: t('documentation.quality.validationDetail'),
                tone: 'success',
              },
              {
                label: t('documentation.quality.lineage'),
                value: t('documentation.quality.persisted'),
                detail: t('documentation.quality.lineageDetail'),
                tone: 'accent',
              },
              {
                label: t('documentation.quality.dependencies'),
                value: t('documentation.quality.mapped'),
                detail: t('documentation.quality.dependenciesDetail'),
                tone: 'accent2',
              },
              {
                label: t('documentation.quality.generation'),
                value: t('documentation.quality.disabled'),
                detail: t('documentation.quality.generationDetail'),
                tone: 'warning',
              },
            ]}
          />

          <StackEcosystemMap
            title={t('documentation.dependencies.title')}
            nodes={[
              {
                label: t('documentation.dependencies.capabilities'),
                value: t('documentation.dependencies.selected'),
                detail: t('documentation.dependencies.capabilitiesDetail'),
                tone: 'accent',
              },
              {
                label: t('documentation.dependencies.modules'),
                value: t('documentation.dependencies.owned'),
                detail: t('documentation.dependencies.modulesDetail'),
                tone: 'accent2',
              },
              {
                label: t('documentation.dependencies.endpoints'),
                value: t('documentation.dependencies.grouped'),
                detail: t('documentation.dependencies.endpointsDetail'),
                tone: 'success',
              },
              {
                label: t('documentation.dependencies.standards'),
                value: t('documentation.dependencies.codified'),
                detail: t('documentation.dependencies.standardsDetail'),
                tone: 'muted',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
