'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AgentSettingsPanelProps {
  artifactId: string;
}

export function AgentSettingsPanel({ artifactId }: AgentSettingsPanelProps) {
  const t = useTranslations('agentWorkspace');
  const tc = useTranslations('common');
  const router = useRouter();
  const { addToast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();

  const deactivateMutation = trpc.artifact.deactivate.useMutation({
    onSuccess: () => {
      setDialogOpen(false);
      addToast(t('deleteAgentSuccess'), 'success');
      router.push('/dashboard/artifacts');
    },
    onError: (err) => {
      addToast(err.message, 'error');
    },
  });

  async function handleExport() {
    setExporting(true);
    try {
      const data = await utils.agent.exportData.fetch({ artifactId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${artifactId}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(t('exportDataSuccess'), 'success');
      if (data.truncated) {
        addToast(t('exportDataTruncated'), 'error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      addToast(message, 'error');
    } finally {
      setExporting(false);
    }
  }

  function handleDeactivate() {
    deactivateMutation.mutate({ id: artifactId });
  }

  return (
    <div className="space-y-4">
      {/* Export Data */}
      <Card>
        <CardHeader>
          <CardTitle>{t('exportDataTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-dune">{t('exportDataDescription')}</p>
          <Button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="min-h-[36px]"
          >
            {exporting ? t('exportDataExporting') : t('exportDataButton')}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card style={{ border: '1px solid color-mix(in srgb, var(--color-sunset) 40%, transparent)' }}>
        <CardHeader>
          <CardTitle className="text-sunset">{t('dangerZoneTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-dune">{t('dangerZoneDescription')}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-[36px] border-sunset/40 text-sunset hover:bg-sunset/5"
            onClick={() => setDialogOpen(true)}
          >
            {t('deleteAgentButton')}
          </Button>
        </CardContent>
      </Card>

      {/* Deactivation confirmation dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} aria-labelledby="deactivate-dialog-title">
        <DialogHeader>
          <DialogTitle id="deactivate-dialog-title">{t('deleteAgentConfirmTitle')}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <DialogDescription>{t('deleteAgentConfirmBody')}</DialogDescription>
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(false)}
          >
            {tc('cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-[36px] bg-sunset text-cream hover:bg-sunset/90"
            onClick={handleDeactivate}
            disabled={deactivateMutation.isPending}
          >
            {t('deleteAgentConfirm')}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
