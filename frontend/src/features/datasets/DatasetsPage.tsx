import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { BarChart } from '../../components/charts/BarChart';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Field';
import { KeyValue } from '../../components/ui/KeyValue';
import { Metric } from '../../components/ui/Metric';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { StatusPill, type Status } from '../../components/ui/Status';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { datasets, type DataQualityReport, type Dataset } from '../../lib/api/endpoints';
import {
  formatBytes,
  formatDatasetDate,
  formatDuration,
  formatValue,
  humanizeEnum,
} from '../../lib/format';
import { PanelState } from '../shared/PanelState';

import { datasetsQueryKey, useDatasetSelection } from './useDatasetSelection';

const STATUS_TONE: Record<string, Status> = {
  UPLOADED: 'info',
  VALIDATING: 'info',
  VALIDATED: 'info',
  PREPROCESSING: 'warning',
  PROCESSED: 'ok',
  FAILED: 'critical',
};

/** Largest file the dataset service accepts, mirrored here to fail fast. */
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export function DatasetsPage() {
  const selection = useDatasetSelection();
  const { datasets: list, selected, setSelectedId } = selection;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [quality, setQuality] = useState<DataQualityReport | null>(null);

  const preprocess = useMutation({
    mutationFn: (datasetId: string) => datasets.preprocess(datasetId),
    onSuccess: (report) => {
      setQuality(report);
      toast({
        title: 'Preprocessing complete',
        description: `${report.valid_rows.toLocaleString()} valid rows, ${report.rejected_rows.toLocaleString()} rejected`,
        status: 'ok',
      });
      void queryClient.invalidateQueries({ queryKey: datasetsQueryKey });
    },
    onError: (error: Error) => {
      toast({ title: 'Preprocessing failed', description: error.message, status: 'critical' });
    },
  });

  const columns: Column<Dataset>[] = [
    {
      id: 'filename',
      header: 'File',
      cell: (row) => (
        <button
          type="button"
          className="text-left text-accent underline-offset-2 hover:underline"
          onClick={() => {
            setSelectedId(row.id);
          }}
        >
          {row.filename}
        </button>
      ),
      sortValue: (row) => row.filename,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusPill status={STATUS_TONE[row.status] ?? 'neutral'}>
          {humanizeEnum(row.status)}
        </StatusPill>
      ),
      sortValue: (row) => row.status,
    },
    {
      id: 'size',
      header: 'Size',
      cell: (row) => formatBytes(row.size_bytes),
      sortValue: (row) => row.size_bytes,
      align: 'right',
      numeric: true,
    },
    {
      id: 'created',
      header: 'Uploaded',
      cell: (row) => formatDatasetDate(row.created_at),
      sortValue: (row) => row.created_at ?? null,
      align: 'right',
    },
    {
      id: 'actions',
      header: '',
      cell: (row) => (
        <Button
          size="sm"
          loading={preprocess.isPending && preprocess.variables === row.id}
          icon={<Play aria-hidden className="size-3" />}
          onClick={() => {
            preprocess.mutate(row.id);
          }}
        >
          Preprocess
        </Button>
      ),
      align: 'right',
    },
  ];

  const report = quality ?? selected?.quality_report ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Datasets & quality"
        lede="Every meter file that has been uploaded, and what the cleaner made of it."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Upload aria-hidden className="size-3.5" />}
            onClick={() => {
              setUploadOpen(true);
            }}
          >
            Upload dataset
          </Button>
        }
      />

      <Panel>
        <PanelHeader title="Datasets" source="the dataset service" />
        <PanelBody className="p-0">
          <PanelState
            isLoading={selection.isLoading}
            error={selection.error}
            isEmpty={list.length === 0}
            empty={
              <EmptyState
                title="No datasets yet"
                description="Upload a meter reading file to start the pipeline."
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setUploadOpen(true);
                    }}
                  >
                    Upload dataset
                  </Button>
                }
              />
            }
          >
            <Table
              caption="Uploaded datasets"
              columns={columns}
              rows={list}
              rowKey={(row) => row.id}
            />
          </PanelState>
        </PanelBody>
      </Panel>

      {selected !== undefined && (
        <Panel>
          <PanelHeader title="Dataset detail" source={selected.filename} />
          <PanelBody>
            <KeyValue
              items={[
                { label: 'Identifier', value: selected.id, mono: true },
                { label: 'SHA-256', value: selected.checksum_sha256, mono: true },
                { label: 'Version', value: String(selected.version) },
                { label: 'Size', value: formatBytes(selected.size_bytes) },
                {
                  label: 'Raw HDFS',
                  value: selected.raw_hdfs_path ?? 'not recorded',
                  mono: true,
                },
                {
                  label: 'Cleaned HDFS',
                  value: selected.cleaned_hdfs_path ?? 'not recorded',
                  mono: true,
                },
              ]}
            />
          </PanelBody>
        </Panel>
      )}

      <QualityReportPanel report={report} />

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        workspaceId={selected?.workspace_id}
      />
    </div>
  );
}

function QualityReportPanel({ report }: { report: DataQualityReport | null }) {
  const rejectionReasons = Object.entries(report?.rejection_reasons ?? {}).filter(
    ([, count]) => count > 0,
  );

  return (
    <Panel>
      <PanelHeader title="Data quality" source="the preprocessing service" />
      <PanelBody>
        {report === null ? (
          <EmptyState
            title="No quality report yet"
            description="Run preprocessing on a dataset to produce one."
          />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Metric label="rows read" value={report.total_input_rows.toLocaleString()} />
              <Metric label="rows the cleaner kept" value={report.valid_rows.toLocaleString()} />
              <Metric label="rows it refused" value={report.rejected_rows.toLocaleString()} />
              <Metric
                label="spent cleaning"
                value={formatDuration(report.processing_duration_sec)}
              />
            </div>

            <KeyValue
              items={[
                {
                  label: 'Valid share',
                  value:
                    report.total_input_rows === 0
                      ? 'not recorded'
                      : formatValue((report.valid_rows / report.total_input_rows) * 100, '%'),
                },
                { label: 'Missing values', value: report.missing_value_rows.toLocaleString() },
                {
                  label: 'Extreme candidates',
                  value: report.extreme_candidate_count.toLocaleString(),
                },
                { label: 'Schema version', value: report.schema_version, mono: true },
                { label: 'Checksum', value: report.checksum_sha256, mono: true },
              ]}
            />

            {rejectionReasons.length > 0 && (
              <BarChart
                title="Rejections by reason"
                description="Rows the cleaner refused, grouped by the rule that rejected them."
                unit="count"
                categoryLabel="Reason"
                data={rejectionReasons.map(([reason, count]) => ({
                  category: reason.replaceAll('_', ' ').toLowerCase(),
                  value: count,
                }))}
                height={200}
              />
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | undefined;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (chosen: File) => datasets.upload(chosen, workspaceId),
    onSuccess: (dataset) => {
      toast({
        title: 'Dataset uploaded',
        description: `${dataset.filename}, ${formatBytes(dataset.size_bytes)}`,
        status: 'ok',
      });
      void queryClient.invalidateQueries({ queryKey: datasetsQueryKey });
      onOpenChange(false);
      setFile(null);
    },
    onError: (uploadError: Error) => {
      setError(uploadError.message);
    },
  });

  const submit = () => {
    setError(null);
    if (file === null) {
      setError('Choose a file to upload.');
      return;
    }
    if (!/\.(txt|csv)$/i.test(file.name)) {
      setError('Only .txt and .csv meter reading files are accepted.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      return;
    }
    upload.mutate(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload dataset"
      description="A semicolon-delimited meter reading file, .txt or .csv, up to 250MB."
      footer={
        <>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" loading={upload.isPending} onClick={submit}>
            Upload
          </Button>
        </>
      }
    >
      <Field label="Meter reading file" error={error ?? undefined} required>
        {({ id, describedBy, invalid }) => (
          <Input
            ref={inputRef}
            id={id}
            type="file"
            accept=".txt,.csv"
            invalid={invalid}
            className="h-auto py-1.5 file:mr-2 file:rounded file:border-0 file:bg-surface-raised file:px-2 file:py-1 file:text-xs file:text-text"
            {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        )}
      </Field>

      {file !== null && (
        <p className="mt-3 text-2xs text-text-muted">
          {file.name}, {formatBytes(file.size)}
        </p>
      )}
    </Dialog>
  );
}
