'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceShell } from '@/components/agent-workspace/workspace-shell';
import { WorkspaceHeader } from '@/components/agent-workspace/workspace-header';
import { PriorityIntents } from '@/components/agent-workspace/priority-intents';
import { AgentActivity } from '@/components/agent-workspace/agent-activity';
import { sectionRegistry } from '@/components/agent-workspace/registry';
import { ModuleSettings } from '@/components/agent-workspace/module-settings';
import { NotificationsBell } from '@/components/agent-workspace/notifications-panel';
import { WorkspaceSectionErrorBoundary } from '@/components/agent-workspace/workspace-section-error-boundary';

export default function AgentWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('agentWorkspace');

  const workspace = trpc.agent.workspace.useQuery(
    { artifactId: id },
    { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
  );

  if (workspace.isLoading) {
    return (
      <WorkspaceShell>
        <div className="space-y-4">
          <div className="rounded-xl bg-charcoal/[0.03] p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-7 w-48" />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
              <Skeleton className="h-24 rounded-xl sm:col-span-4" />
              <Skeleton className="h-24 rounded-xl sm:col-span-3" />
              <Skeleton className="h-24 rounded-xl sm:col-span-5" />
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </WorkspaceShell>
    );
  }

  if (workspace.isError) {
    return (
      <WorkspaceShell>
        <QueryError error={workspace.error} onRetry={() => workspace.refetch()} />
      </WorkspaceShell>
    );
  }

  const data = workspace.data!;
  const { artifact, boundModules, metrics } = data;
  const sections = sectionRegistry[artifact.type] ?? [];

  return (
    <WorkspaceShell>
      <WorkspaceHeader
        artifact={{
          id: artifact.id,
          name: artifact.name,
          type: artifact.type,
          isActive: artifact.isActive,
        }}
        metrics={metrics}
        boundModules={boundModules.map((m) => ({
          slug: m.slug,
          name: m.name,
          autonomyLevel: m.autonomyLevel,
        }))}
        rightAction={<NotificationsBell artifactId={id} />}
      />

      {/* Module settings — collapsible, shown for all agent types */}
      <WorkspaceSectionErrorBoundary key="module-settings">
        <ModuleSettings
          artifactId={id}
          boundModules={data.boundModules.map((m) => ({
            id: m.id,
            moduleId: m.moduleId,
            slug: m.slug,
            name: m.name,
            autonomyLevel: m.autonomyLevel,
            configOverrides: (m.configOverrides ?? {}) as Record<string, unknown>,
          }))}
        />
      </WorkspaceSectionErrorBoundary>

      {/* Type-specific sections from registry */}
      {sections.map((Section, i) => (
        <WorkspaceSectionErrorBoundary key={`section-${i}`}>
          <Section artifactId={id} />
        </WorkspaceSectionErrorBoundary>
      ))}

      {/* Shared sections: priority intents + activity */}
      <WorkspaceSectionErrorBoundary key="priority-intents">
        <PriorityIntents artifactId={id} />
      </WorkspaceSectionErrorBoundary>
      <WorkspaceSectionErrorBoundary key="agent-activity">
        <AgentActivity artifactId={id} />
      </WorkspaceSectionErrorBoundary>
    </WorkspaceShell>
  );
}
