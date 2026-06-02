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
import { useUiStore } from '@/stores/use-ui-store';

export function UxFoundationDemo() {
  const addToast = useUiStore((state) => state.addToast);
  const openModal = useUiStore((state) => state.openModal);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const openNotificationCenter = useUiStore((state) => state.openNotificationCenter);

  return (
    <section className="space-y-5">
      <SectionHeader
        title="UX system foundation"
        description="Reusable operational UX primitives for future projects, templates, downloads, and LDCN workflows."
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <FeatureCard
          eyebrow="Feedback"
          title="Toast, modal, drawer, loading, error, and notification systems are ready."
          description="These surfaces are foundation-only and execute local UI actions without backend, AI, agents, voice, avatar, or generation."
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() =>
                  addToast({
                    tone: 'success',
                    title: 'Toast system online',
                    description: 'Premium notification rendered with current theme tokens.',
                    action: {
                      label: 'Open center',
                      onSelect: openNotificationCenter,
                    },
                  })
                }
              >
                <Sparkles className="h-4 w-4" />
                Show toast
              </Button>
              <Button type="button" variant="secondary" onClick={() => openModal('confirmation')}>
                <ShieldAlert className="h-4 w-4" />
                Open modal
              </Button>
              <Button type="button" variant="secondary" onClick={() => openDrawer('details')}>
                <PanelRightOpen className="h-4 w-4" />
                Open drawer
              </Button>
              <Button type="button" variant="soft" onClick={openNotificationCenter}>
                <Bell className="h-4 w-4" />
                Notifications
              </Button>
            </div>
          }
        />

        <Card className="space-y-4">
          <TextField
            label="Project name"
            description="Validation-ready input surface."
            placeholder="ldcn-enterprise-app"
          />
          <TextareaField
            label="Operational brief"
            description="Textarea foundation for future wizard prompts."
            placeholder="Describe what the generated project should do."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Stack" defaultValue="fastapi">
              <option value="fastapi">FastAPI</option>
              <option value="spring">Spring Boot</option>
              <option value="next">Next.js</option>
            </SelectField>
            <TextField
              label="Field with error"
              placeholder="Required value"
              error="Foundation validation message."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField label="Include documentation" description="Ready for future generation options." defaultChecked />
            <RadioField label="Local Build 90%" description="Static local execution path." name="build-mode-demo" defaultChecked />
          </div>
          <SwitchField label="Observable runtime" description="Future telemetry-ready preference." checked />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <FilterBar />
          <Card className="space-y-3">
            <ListRow
              title="Project registry row"
              description="Reusable list row for future projects."
              status="ready"
            />
            <ListRow
              title="Template blueprint row"
              description="Reusable list row for future templates."
              status="planned"
            />
            <ListRow
              title="Secure download row"
              description="Reserved for future download registry."
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
          <p className="text-sm font-semibold text-[color:var(--text)]">Loading states</p>
          <Button type="button" variant="secondary">
            <ButtonLoading label="Button loading" />
          </Button>
          <CardLoading className="shadow-none" />
        </Card>
      </div>
    </section>
  );
}
