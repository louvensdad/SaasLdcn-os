'use client';

import { Bell, PanelRightOpen, ShieldAlert, Sparkles } from 'lucide-react';

import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { FilterBar, ListRow } from '@/components/data/list-foundation';
import { EmptyState } from '@/components/empty-states/empty-state';
import { PageError } from '@/components/feedback/error-system';
import { ButtonLoading, CardLoading } from '@/components/feedback/loading-system';
import {
  CheckboxField,
  RadioField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from '@/components/forms/form-field';
import { FeatureCard } from '@/components/shell/feature-card';
import { SectionHeader } from '@/components/shell/section-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { useUiStore } from '@/stores/use-ui-store';

export function UxFoundationDemo() {
  const { t } = useLocale();
  const addToast = useUiStore((state) => state.addToast);
  const openModal = useUiStore((state) => state.openModal);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const openNotificationCenter = useUiStore((state) => state.openNotificationCenter);

  return (
    <section className="space-y-5">
      <SectionHeader
        title={t('foundation.title')}
        description={t('foundation.description')}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <FeatureCard
          eyebrow={t('foundation.feedback')}
          title={t('foundation.feedbackTitle')}
          description={t('foundation.feedbackDescription')}
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  addToast({
                    tone: 'success',
                    title: t('foundation.toastTitle'),
                    description: t('foundation.toastDescription'),
                    action: {
                      label: t('foundation.openCenter'),
                      onSelect: openNotificationCenter,
                    },
                  })
                }
              >
                <Sparkles className="h-4 w-4" />
                {t('foundation.showToast')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => openModal('confirmation')}>
                <ShieldAlert className="h-4 w-4" />
                {t('foundation.openModal')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => openDrawer('details')}>
                <PanelRightOpen className="h-4 w-4" />
                {t('foundation.openDrawer')}
              </Button>
              <Button type="button" variant="soft" onClick={openNotificationCenter}>
                <Bell className="h-4 w-4" />
                {t('notifications.title')}
              </Button>
            </div>
          }
        />

        <Card className="space-y-4">
          <TextField
            label={t('foundation.projectName')}
            description={t('foundation.projectNameDetail')}
            placeholder={t('foundation.projectNamePlaceholder')}
          />
          <TextareaField
            label={t('foundation.operationalBrief')}
            description={t('foundation.operationalBriefDetail')}
            placeholder={t('foundation.operationalBriefPlaceholder')}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label={t('foundation.stack')} defaultValue="fastapi">
              <option value="fastapi">{t('foundation.framework.fastapi')}</option>
              <option value="spring">{t('foundation.framework.spring')}</option>
              <option value="next">{t('foundation.framework.next')}</option>
            </SelectField>
            <TextField
              label={t('foundation.errorField')}
              placeholder={t('foundation.requiredValue')}
              error={t('foundation.validationMessage')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField label={t('foundation.includeDocumentation')} description={t('foundation.generationOptions')} defaultChecked />
            <RadioField label={t('foundation.localBuild')} description={t('foundation.localExecution')} name="build-mode-demo" defaultChecked />
          </div>
          <SwitchField label={t('foundation.observableRuntime')} description={t('foundation.telemetryPreference')} checked />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <FilterBar />
          <Card className="space-y-3">
            <ListRow
              title={t('foundation.projectRow')}
              description={t('foundation.projectRowDetail')}
              status="ready"
            />
            <ListRow
              title={t('foundation.templateRow')}
              description={t('foundation.templateRowDetail')}
              status="planned"
            />
            <ListRow
              title={t('foundation.downloadRow')}
              description={t('foundation.downloadRowDetail')}
              status="draft"
            />
          </Card>
        </div>
        <ActivityTimeline />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <EmptyState kind="projects" />
        <EmptyState kind="templates" />
        <EmptyState kind="downloads" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PageError />
        <Card className="space-y-4">
          <p className="text-sm font-semibold text-[color:var(--text)]">{t('foundation.loadingStates')}</p>
          <Button type="button" variant="secondary">
            <ButtonLoading label={t('foundation.buttonLoading')} />
          </Button>
          <CardLoading className="shadow-none" />
        </Card>
      </div>
    </section>
  );
}
