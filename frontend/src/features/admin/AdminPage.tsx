import { useQuery } from '@tanstack/react-query';

import { Panel, PanelBody } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { StatusPill, type Status } from '../../components/ui/Status';
import { Table, type Column } from '../../components/ui/Table';
import { Tabs } from '../../components/ui/Tabs';
import { apiRequest } from '../../lib/api/client';
import { auth, type User } from '../../lib/api/endpoints';
import { formatDatasetTime } from '../../lib/format';
import { PanelState } from '../shared/PanelState';

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  timestamp: string | null;
  request_id: string | null;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  actor: string;
  timestamp: string | null;
  request_id: string | null;
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value !== '' ? value : fallback;

const nullableStr = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

function parseAudit(payload: unknown): AuditEntry[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((row, index) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id, `audit-${String(index)}`),
      actor: str(r.actor, 'Unknown'),
      action: str(r.action, 'Unknown'),
      resource: str(r.resource, str(r.resource_type, '—')),
      timestamp: nullableStr(r.timestamp),
      request_id: nullableStr(r.request_id),
    };
  });
}

function parseSecurity(payload: unknown): SecurityEvent[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((row, index) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id, `event-${String(index)}`),
      event_type: str(r.event_type, 'Unknown'),
      severity: str(r.severity, 'INFO'),
      actor: str(r.actor, 'Unknown'),
      timestamp: nullableStr(r.timestamp),
      request_id: nullableStr(r.request_id),
    };
  });
}

const SEVERITY_TONE: Record<string, Status> = {
  CRITICAL: 'critical',
  HIGH: 'critical',
  WARNING: 'warning',
  MEDIUM: 'warning',
  INFO: 'info',
  LOW: 'neutral',
};

const USER_COLUMNS: Column<User>[] = [
  { id: 'email', header: 'Email', cell: (row) => row.email, sortValue: (row) => row.email },
  { id: 'name', header: 'Name', cell: (row) => row.full_name, sortValue: (row) => row.full_name },
  {
    id: 'role',
    header: 'Role',
    cell: (row) => <StatusPill status="info">{row.role}</StatusPill>,
    sortValue: (row) => row.role,
  },
  {
    id: 'active',
    header: 'Active',
    cell: (row) => (
      <StatusPill status={row.is_active ? 'ok' : 'neutral'}>
        {row.is_active ? 'Active' : 'Disabled'}
      </StatusPill>
    ),
    sortValue: (row) => String(row.is_active),
  },
];

const AUDIT_COLUMNS: Column<AuditEntry>[] = [
  {
    id: 'time',
    header: 'Time',
    cell: (row) => formatDatasetTime(row.timestamp, { withSeconds: true }),
    sortValue: (row) => row.timestamp,
  },
  { id: 'actor', header: 'Actor', cell: (row) => row.actor, sortValue: (row) => row.actor },
  { id: 'action', header: 'Action', cell: (row) => row.action, sortValue: (row) => row.action },
  { id: 'resource', header: 'Resource', cell: (row) => row.resource },
  {
    id: 'request',
    header: 'Correlation id',
    cell: (row) => row.request_id ?? 'Not recorded',
    align: 'right',
  },
];

const SECURITY_COLUMNS: Column<SecurityEvent>[] = [
  {
    id: 'time',
    header: 'Time',
    cell: (row) => formatDatasetTime(row.timestamp, { withSeconds: true }),
    sortValue: (row) => row.timestamp,
  },
  {
    id: 'severity',
    header: 'Severity',
    cell: (row) => (
      <StatusPill status={SEVERITY_TONE[row.severity] ?? 'neutral'}>{row.severity}</StatusPill>
    ),
    sortValue: (row) => row.severity,
  },
  {
    id: 'type',
    header: 'Event',
    cell: (row) => row.event_type,
    sortValue: (row) => row.event_type,
  },
  { id: 'actor', header: 'Actor', cell: (row) => row.actor, sortValue: (row) => row.actor },
  {
    id: 'request',
    header: 'Correlation id',
    cell: (row) => row.request_id ?? 'Not recorded',
    align: 'right',
  },
];

/**
 * Administration.
 *
 * The route is behind RequireRole, which is a convenience: the API enforces
 * authorisation on every one of these calls and will refuse a non-admin
 * regardless of what the UI shows.
 */
export function AdminPage() {
  const users = useQuery({ queryKey: ['admin', 'users'] as const, queryFn: () => auth.users() });

  const audit = useQuery({
    queryKey: ['admin', 'audit'] as const,
    queryFn: async () => parseAudit(await apiRequest<unknown>('/auth/audit-logs?limit=100')),
  });

  const events = useQuery({
    queryKey: ['admin', 'security'] as const,
    queryFn: async () =>
      parseSecurity(await apiRequest<unknown>('/auth/security-events?limit=100')),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text">Administration</h1>

      <Panel>
        <Tabs
          label="Administration views"
          items={[
            {
              value: 'users',
              label: 'Users',
              content: (
                <PanelBody className="p-0">
                  <PanelState
                    isLoading={users.isLoading}
                    error={users.error}
                    isEmpty={(users.data ?? []).length === 0}
                    empty={<EmptyState title="No users returned" />}
                    onRetry={() => void users.refetch()}
                  >
                    <Table
                      caption="Platform users"
                      columns={USER_COLUMNS}
                      rows={users.data ?? []}
                      rowKey={(row) => row.id}
                      maxHeight="28rem"
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
            {
              value: 'audit',
              label: 'Audit log',
              content: (
                <PanelBody className="p-0">
                  <PanelState
                    isLoading={audit.isLoading}
                    error={audit.error}
                    isEmpty={(audit.data ?? []).length === 0}
                    empty={<EmptyState title="No audit entries recorded" />}
                    onRetry={() => void audit.refetch()}
                  >
                    <Table
                      caption="Audit log"
                      columns={AUDIT_COLUMNS}
                      rows={audit.data ?? []}
                      rowKey={(row) => row.id}
                      maxHeight="28rem"
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
            {
              value: 'security',
              label: 'Security events',
              content: (
                <PanelBody className="p-0">
                  <PanelState
                    isLoading={events.isLoading}
                    error={events.error}
                    isEmpty={(events.data ?? []).length === 0}
                    empty={<EmptyState title="No security events recorded" />}
                    onRetry={() => void events.refetch()}
                  >
                    <Table
                      caption="Security events"
                      columns={SECURITY_COLUMNS}
                      rows={events.data ?? []}
                      rowKey={(row) => row.id}
                      maxHeight="28rem"
                    />
                  </PanelState>
                </PanelBody>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
