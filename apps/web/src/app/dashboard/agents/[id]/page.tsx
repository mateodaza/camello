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

export default function AgentWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('agentWorkspace');

  const workspace = trpc.agent.workspace.useQuery({ artifactId: id });

  if (workspace.isLoading) {
    return (
      <WorkspaceShell>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
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
      />

      {/* Type-specific sections from registry */}
      {sections.map((Section, i) => (
        <Section key={i} artifactId={id} />
      ))}

      {/* Shared sections: priority intents + activity */}
      <PriorityIntents artifactId={id} />
      <AgentActivity artifactId={id} />
    </WorkspaceShell>
  );
}
