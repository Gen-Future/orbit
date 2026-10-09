'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Plus,
  Orbit as OrbitIcon,
  Sun,
  Grid2X2,
  Inbox,
  Layers,
  History,
  FileText,
  Settings,
  Search,
  Check,
  ChevronDown,
  ChevronRight,
  X,
  Sparkles,
  Clock,
  Command,
  LogOut,
  Archive,
  Undo2,
  Bell,
  RefreshCw,
  Download,
  Copy,
  KeyRound,
  Users,
  SlidersHorizontal,
  Zap,
  CornerDownLeft,
  LoaderCircle,
  Menu,
  CheckCheck,
  Target,
  ExternalLink,
  ShieldCheck,
  Server,
  Activity,
  Trash2,
  Play,
  Save,
  Circle,
  Ban,
} from 'lucide-react';
import {
  quadrantNames,
  isPositionOnlyEvent,
  zonedInstant,
  localParts,
  type CaptureDraft,
} from '../../packages/core/src';
import { ReportFoundry } from './report-foundry';
import { NebulaMatrix, type StellarOutcome } from './nebula-matrix';
import type { SedimentPage, SedimentSummary } from './sediment-belt';
import type { OrbitPoint } from '../../packages/core/src/orbit-position';
type Project = { id: string; name: string; description: string; color: string };
type Item = {
  id: string;
  title: string;
  notes: string;
  quadrant: number;
  status: string;
  version: number;
  projectId: string | null;
  parentId: string | null;
  sourceReportId?: string | null;
  project?: Project | null;
  createdAt: string;
  occurredAt: string;
  updatedAt: string;
  dueAt: string | null;
  orbitX?: number | null;
  orbitY?: number | null;
  orbitPlacedAt?: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  reminders?: { id: string; scheduledAt: string }[];
};
type Workspace = { id: string; name: string; timezone: string };
type Membership = { role: string; workspace: Workspace };
type User = { id: string; name: string; email: string; isSystemAdmin: boolean };
type Event = {
  id: string;
  type: string;
  createdAt: string;
  itemId: string | null;
  actorId: string;
  item?: { title: string; projectId?: string | null };
  data: Record<string, unknown>;
};
type Report = { id: string; content: string; startAt: string; endAt: string; sourceIds: string[] };
type Notification = {
  id: string;
  title: string;
  body: string;
  itemId: string | null;
  readAt: string | null;
  createdAt: string;
  lastError?: string;
};
const emptySedimentSummary: SedimentSummary = {
  total: 0,
  byQuadrant: {
    1: { count: 0, earliestDueAt: null },
    2: { count: 0, earliestDueAt: null },
    3: { count: 0, earliestDueAt: null },
    4: { count: 0, earliestDueAt: null },
  },
  earliestDueAt: null,
  thresholdAt: new Date(0).toISOString(),
  serverNow: new Date(0).toISOString(),
};
type Preferences = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietStart: number;
  quietEnd: number;
  morningHour: number;
  morningEnabled: boolean;
  dailyLimit: number;
  pausedUntil?: string | null;
};
type Config = {
  ai: { provider: string; baseUrl: string; model: string; hasKey: boolean } | null;
  preferences: Preferences | null;
  vapidPublicKey: string | null;
  smtpConfigured: boolean;
  aiConfigured: boolean;
};
type AIEndpointView = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  active: boolean;
  hasKey: boolean;
  updatedAt: string;
};
type AdminOverview = {
  totals: {
    users: number;
    workspaces: number;
    openItems: number;
    completedItems: number;
    overdueItems: number;
    reports: number;
    aiSucceeded: number;
    aiFailed: number;
    activeUsers: number;
  };
  activity: { date: string; created: number; completed: number }[];
  recentUsers: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    isSystemAdmin: boolean;
  }[];
  activeEndpoint: { id: string; name: string; provider: string; model: string } | null;
};
type Tab =
  | 'today'
  | 'matrix'
  | 'inbox'
  | 'projects'
  | 'timeline'
  | 'reports'
  | 'settings'
  | 'admin';
const navigation = [
  { id: 'today', label: '今日轨道', icon: Sun },
  { id: 'matrix', label: '四象限', icon: Grid2X2 },
  { id: 'inbox', label: '收件箱', icon: Inbox },
  { id: 'projects', label: '项目', icon: Layers },
  { id: 'timeline', label: '时光回放', icon: History },
  { id: 'reports', label: '周报', icon: FileText },
] as const;
const statuses: Record<string, string> = {
  open: '待开始',
  doing: '进行中',
  blocked: '已阻塞',
  done: '已完成',
};
const statusOptions = [
  { value: 'open', label: '待开始', cosmic: '静候', icon: Circle },
  { value: 'doing', label: '进行中', cosmic: '运转', icon: Play },
  { value: 'blocked', label: '已阻塞', cosmic: '受阻', icon: Ban },
  { value: 'done', label: '已完成', cosmic: '余辉', icon: Check },
] as const;
const eventsLabel: Record<string, string> = {
  created: '记录了事项',
  updated: '调整了事项',
  positioned: '移动了星体',
  completed: '完成了事项',
  reopened: '重新打开事项',
  archived: '归档了事项',
  restored: '恢复了事项',
  deleted: '删除了事项',
  undeleted: '恢复了已删除事项',
  snoozed: '稍后提醒',
  'project.created': '创建项目',
  'report.created': '生成周报',
  'report.updated': '编辑周报',
  'member.added': '加入空间',
  'token.created': '创建访问令牌',
  'token.revoked': '撤销访问令牌',
  'settings.ai.updated': '更新模型配置',
};
const defaultPrefs: Preferences = {
  pushEnabled: false,
  emailEnabled: false,
  quietStart: 22,
  quietEnd: 8,
  morningHour: 9,
  morningEnabled: true,
  dailyLimit: 6,
};
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T = Record<string, unknown>>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('服务暂时无法连接，请稍后重试');
  }
  if (!response.ok)
    throw new ApiError(result.details?.join('；') || result.error || '请求失败', response.status);
  return result;
}
function shortDate(value: string | null, zone = 'Asia/Shanghai') {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: zone,
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value))
    : '';
}
function inputDate(value: string | null, zone: string) {
  if (!value) return '';
  const p = localParts(new Date(value), zone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function fromInput(value: string, zone: string) {
  return value ? zonedInstant(value.slice(0, 10), value.slice(11, 16), zone) : null;
}
export default function Orbit() {
  const [user, setUser] = useState<User | null>(null),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [wid, setWid] = useState(''),
    [ready, setReady] = useState(false),
    [bootError, setBootError] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('matrix'),
    [items, setItems] = useState<Item[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [notifications, setNotifications] = useState<Notification[]>([]),
    [config, setConfig] = useState<Config | null>(null);
  const [query, setQuery] = useState(''),
    [projectFilter, setProjectFilter] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState(''),
    [archiveFilter, setArchiveFilter] = useState('active');
  const [intent, setIntent] = useState(''),
    [draft, setDraft] = useState<CaptureDraft | null>(null),
    [draftMode, setDraftMode] = useState('manual'),
    [draftFor, setDraftFor] = useState<Item | null>(null),
    [busy, setBusy] = useState(''),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [celebration, setCelebration] = useState<string | null>(null);
  const [stellarOutcome, setStellarOutcome] = useState<StellarOutcome | null>(null);
  const [sedimentSummary, setSedimentSummary] = useState<SedimentSummary>(emptySedimentSummary);
  const [undoDeleted, setUndoDeleted] = useState<Item | null>(null);
  const [archiveRows, setArchiveRows] = useState<Item[]>([]),
    [archiveTotal, setArchiveTotal] = useState(0),
    [archivePage, setArchivePage] = useState(1),
    [archiveLoading, setArchiveLoading] = useState(false),
    [selectedEvents, setSelectedEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<Item | null>(null),
    [showNotifications, setShowNotifications] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [matrixImmersive, setMatrixImmersive] = useState(false),
    [now, setNow] = useState<Date | null>(null),
    [reduced, setReduced] = useState(false),
    [dataLoading, setDataLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const selectedWorkspace = memberships.find((m) => m.workspace.id === wid);
  const workspace = selectedWorkspace?.workspace;
  const role = selectedWorkspace?.role || 'viewer';
  const writable = role !== 'viewer',
    isAdmin = ['owner', 'admin'].includes(role);
  const zone = workspace?.timezone || 'Asia/Shanghai';
  const prefix = `workspaces/${wid}`;
  const requestGeneration = useRef(0);
  const notify = (text: string) => setToast(text);
  const boot = useCallback(async () => {
    try {
      const me = await api<{ user: User; memberships: Membership[] }>('auth/me');
      setUser(me.user);
      setMemberships(me.memberships);
      const params = new URLSearchParams(window.location.search);
      if (params.get('report')) {
        setReportTarget(params.get('report'));
        setTab('reports');
      }
      const stored = params.get('workspace') || localStorage.getItem('orbit.workspace');
      setWid((current) =>
        me.memberships.some((m) => m.workspace.id === current)
          ? current
          : me.memberships.find((m) => m.workspace.id === stored)?.workspace.id ||
            me.memberships[0]?.workspace.id ||
            '',
      );
      setBootError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setBootError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!wid) return;
    const generation = ++requestGeneration.current;
    setDataLoading(true);
    try {
      const [rows, ps, es, rs, ns, cs, sediment] = await Promise.all([
        api<{ items: Item[]; total: number }>(`workspaces/${wid}/items?limit=1000`),
        api<Project[]>(`workspaces/${wid}/projects`),
        api<Event[]>(`workspaces/${wid}/events`),
        api<Report[]>(`workspaces/${wid}/reports`),
        api<Notification[]>(`workspaces/${wid}/notifications`),
        api<Config>(`workspaces/${wid}/settings`),
        api<SedimentPage<Item>>(`workspaces/${wid}/items/sediment?limit=1`),
      ]);
      if (generation !== requestGeneration.current) return;
      setItems(rows.items);
      setProjects(ps);
      setEvents(es);
      setReports(rs);
      setNotifications(ns);
      setConfig(cs);
      setSedimentSummary(sediment.summary);
      if (rows.total > 1000) setError('当前工作台展示最近 1000 条事项；时光回放支持完整分页检索。');
      setSelected((current) =>
        current ? rows.items.find((x) => x.id === current.id) || current : null,
      );
      const id = new URLSearchParams(window.location.search).get('item');
      if (id) {
        const match = rows.items.find((x) => x.id === id);
        if (match) setSelected(match);
        else {
          const archived = await api<Item>(`workspaces/${wid}/items/${id}`);
          if (generation === requestGeneration.current) setSelected(archived);
        }
        window.history.replaceState(null, '', `/?workspace=${wid}`);
      }
    } catch (e) {
      if (generation === requestGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === requestGeneration.current) setDataLoading(false);
    }
  }, [wid]);
  const loadSediment = useCallback(
    async ({ page, quadrant, query }: { page: number; quadrant: number; query: string }) => {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (quadrant) params.set('quadrant', String(quadrant));
      if (query.trim()) params.set('q', query.trim());
      const result = await api<SedimentPage<Item>>(
        `workspaces/${wid}/items/sediment?${params.toString()}`,
      );
      setSedimentSummary(result.summary);
      return result;
    },
    [wid],
  );
  useEffect(() => {
    boot();
    setNow(new Date());
    setReduced(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        localStorage.getItem('orbit.reduced') === 'true',
    );
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [boot]);
  useEffect(() => {
    if (wid) {
      localStorage.setItem('orbit.workspace', wid);
      setSelected(null);
      setUndoDeleted(null);
      setStellarOutcome(null);
      setDraft(null);
      setProjectFilter('');
      setItems([]);
      setProjects([]);
      setEvents([]);
      setReports([]);
      setNotifications([]);
      setConfig(null);
      setArchiveRows([]);
      setError('');
      refresh();
      const timer = setInterval(refresh, 60000);
      return () => {
        clearInterval(timer);
        requestGeneration.current++;
      };
    }
  }, [wid, refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);
  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = navRef.current;
    const controls = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select') || [],
      ).filter((x) => x.getClientRects().length);
    node?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = controls();
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    };
    node?.addEventListener('keydown', trap);
    return () => {
      node?.removeEventListener('keydown', trap);
      document.body.style.overflow = previousOverflow;
      menuRef.current?.focus();
    };
  }, [mobileNav]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), reduced ? 1600 : 2800);
    return () => clearTimeout(timer);
  }, [celebration, reduced]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (tab === 'today') inputRef.current?.focus();
        else if (writable) {
          setDraft({ title: '', notes: '', quadrant: 0, subtasks: [] });
          setDraftFor(null);
          setDraftMode('manual');
        }
      }
      if (e.key === 'Escape') {
        setSelected(null);
        setDraft(null);
        setMobileNav(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [tab, writable]);

  useEffect(() => {
    setArchivePage(1);
  }, [query, projectFilter, statusFilter, dateFrom, dateTo, archiveFilter, wid]);
  useEffect(() => {
    if (tab !== 'timeline' || !wid) return;
    let active = true;
    setArchiveLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ page: String(archivePage), limit: '100', q: query });
        if (projectFilter) params.set('projectId', projectFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (archiveFilter === 'archived') params.set('archived', 'true');
        if (archiveFilter === 'all') params.set('all', 'true');
        if (archiveFilter === 'deleted') params.set('deleted', 'true');
        if (dateFrom) params.set('from', zonedInstant(dateFrom, '00:00', zone));
        if (dateTo) {
          const end = new Date(dateTo + 'T12:00:00Z');
          end.setUTCDate(end.getUTCDate() + 1);
          params.set('to', zonedInstant(end.toISOString().slice(0, 10), '00:00', zone));
        }
        const response = await api<{ items: Item[]; total: number }>(`${prefix}/items?${params}`);
        if (active) {
          setArchiveRows(response.items);
          setArchiveTotal(response.total);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setArchiveLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    tab,
    wid,
    query,
    projectFilter,
    statusFilter,
    dateFrom,
    dateTo,
    archiveFilter,
    archivePage,
    zone,
    prefix,
    items,
  ]);
  useEffect(() => {
    if (!selected) {
      setSelectedEvents([]);
      return;
    }
    let active = true;
    api<Item & { events: Event[] }>(`${prefix}/items/${selected.id}`)
      .then((item) => {
        if (active) setSelectedEvents(item.events);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.version, prefix]);
  async function openItem(id: string) {
    try {
      const item = await api<Item>(`${prefix}/items/${id}`);
      setSelected(item);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function run(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function patch(item: Item, changes: Record<string, unknown>): Promise<boolean> {
    let saved = false;
    await run(`item:${item.id}`, async () => {
      const updated = await api<Item>(`${prefix}/items/${item.id}`, 'PATCH', {
        version: item.version,
        ...changes,
      });
      setItems((current) => current.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
      if (changes.status === 'done' && item.status !== 'done') {
        setCelebration(item.title);
        setStellarOutcome({ item, kind: 'complete', serial: Date.now() });
        if (tab === 'matrix') setSelected(null);
      }
      saved = true;
      await refresh();
    });
    return saved;
  }
  async function deleteItem(item: Item): Promise<boolean> {
    let saved = false;
    await run(`delete:${item.id}`, async () => {
      const result = await api<{ item: Item; affectedIds: string[] }>(
        `${prefix}/items/${item.id}`,
        'DELETE',
        { version: item.version },
      );
      setItems((current) => current.filter((x) => !result.affectedIds.includes(x.id)));
      setSelected(null);
      setUndoDeleted(result.item);
      setStellarOutcome({ item, kind: 'delete', serial: Date.now() });
      saved = true;
      await refresh();
    });
    return saved;
  }
  async function restoreItem(item: Item) {
    await run(`restore:${item.id}`, async () => {
      await api(`${prefix}/items/${item.id}/restore`, 'POST', { version: item.version });
      setUndoDeleted(null);
      setSelected(null);
      notify('事项已恢复。需要提醒时，请重新设置时间。');
      await refresh();
      setArchiveFilter('active');
    });
  }
  async function moveItem(item: Item, point: OrbitPoint): Promise<boolean> {
    try {
      const updated = await api<Item>(`${prefix}/items/${item.id}`, 'PATCH', {
        version: item.version,
        position: point,
      });
      setItems((current) => current.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function bulkRescheduleSediment(
    entries: { id: string; version: number }[],
    dueAt: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy('sediment-reschedule');
    setError('');
    try {
      await api(`${prefix}/items/bulk-reschedule`, 'POST', { items: entries, dueAt });
      notify(`已重新安排 ${entries.length} 件事项。`);
      await refresh();
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      throw cause;
    } finally {
      setBusy('');
    }
  }
  async function parseIntent(text = intent) {
    if (!text.trim()) return;
    await run('capture', async () => {
      const result = await api<{ draft: CaptureDraft; mode: string; message: string }>(
        `${prefix}/ai`,
        'POST',
        { text },
      );
      setDraft(result.draft);
      setDraftMode(result.mode);
      setDraftFor(null);
      if (result.mode !== 'ai') notify(result.message);
    });
  }
  async function saveDraft(value: CaptureDraft) {
    await run('save-draft', async () => {
      if (draftFor) {
        await api(`${prefix}/items/${draftFor.id}/plan`, 'POST', {
          ...value,
          version: draftFor.version,
        });
      } else await api(`${prefix}/capture`, 'POST', { ...value, source: draftMode });
      setDraft(null);
      setDraftFor(null);
      setIntent('');
      notify('已进入轨道，随时可以继续推进。');
      await refresh();
    });
  }
  const active = useMemo(() => items.filter((x) => !x.archivedAt && x.status !== 'done'), [items]);
  const roots = active.filter((x) => !x.parentId);
  const done = items.filter((x) => x.status === 'done' && !x.archivedAt);
  const todayString = now ? inputDate(now.toISOString(), zone).slice(0, 10) : '';
  const todayDone = done.filter(
    (x) => x.completedAt && inputDate(x.completedAt, zone).slice(0, 10) === todayString,
  );
  const focus = [...roots].sort(
    (a, b) =>
      (a.quadrant === 1 ? -2 : a.quadrant === 2 ? -1 : 1) -
        (b.quadrant === 1 ? -2 : b.quadrant === 2 ? -1 : 1) ||
      (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity),
  );
  const overdue = active.filter((x) => x.dueAt && now && Date.parse(x.dueAt) < now.getTime()),
    forgotten = active.filter((x) => now && now.getTime() - Date.parse(x.updatedAt) > 7 * 864e5);
  const filtered = items.filter(
    (x) =>
      (archiveFilter === 'all' ||
        (archiveFilter === 'archived' ? Boolean(x.archivedAt) : !x.archivedAt)) &&
      (!query ||
        `${x.title} ${x.notes} ${x.project?.name || ''}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!projectFilter || x.projectId === projectFilter) &&
      (!statusFilter || x.status === statusFilter) &&
      (!dateFrom || inputDate(x.occurredAt, zone).slice(0, 10) >= dateFrom) &&
      (!dateTo || inputDate(x.occurredAt, zone).slice(0, 10) <= dateTo),
  );
  const taskRow = (item: Item, compact = false) => (
    <div
      key={item.id}
      className={`task-row ${item.status === 'done' ? 'is-done' : ''} ${compact ? 'compact' : ''}`}
    >
      <button
        className="complete-check"
        aria-label={`${item.status === 'done' ? '重新打开' : '完成'} ${item.title}`}
        disabled={!writable || Boolean(busy) || Boolean(item.deletedAt)}
        onClick={() => patch(item, { status: item.status === 'done' ? 'open' : 'done' })}
      >
        {item.status === 'done' && <Check size={15} />}
      </button>
      <button className="task-main" onClick={() => setSelected(item)}>
        <span className="task-title">{item.title}</span>
        <span className="task-meta">
          {item.parentId && '子事项 · '}
          {item.project?.name || '独立事项'}
          {item.dueAt && (
            <>
              {' '}
              <span>·</span>{' '}
              <span
                className={
                  now && Date.parse(item.dueAt) < now.getTime() && item.status !== 'done'
                    ? 'overdue'
                    : ''
                }
              >
                {shortDate(item.dueAt, zone)}
              </span>
            </>
          )}
          {item.status === 'blocked' && <span className="blocked-label">阻塞中</span>}
        </span>
      </button>
      <span className={`q-dot q${item.quadrant}`} title={quadrantNames[item.quadrant]} />
      <button
        className="icon-button row-arrow"
        aria-label={`查看 ${item.title}`}
        onClick={() => setSelected(item)}
      >
        <ArrowUpRight size={17} />
      </button>
    </div>
  );
  if (!ready)
    return (
      <main className="boot">
        <OrbitIcon size={48} />
        <p>正在接入你的轨道…</p>
      </main>
    );
  if (!user)
    return (
      <Auth
        onSuccess={() => {
          setTab('matrix');
          return boot();
        }}
        initialError={bootError}
      />
    );
  return (
    <div
      className={`app ${writable && !['matrix', 'admin', 'reports'].includes(tab) ? 'has-capture' : ''} ${reduced ? 'reduced-motion' : ''} ${tab === 'matrix' ? 'matrix-page' : ''} ${matrixImmersive && tab === 'matrix' ? 'matrix-immersive' : ''}`}
    >
      <a href="#main" className="skip-link">
        跳转到主内容
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          tabIndex={-1}
          aria-label="关闭导航背景"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        id="main-navigation"
        ref={navRef}
        hidden={tab === 'matrix' && !mobileNav}
        role={mobileNav ? 'dialog' : undefined}
        aria-modal={mobileNav ? true : undefined}
        aria-label="主导航"
        className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}
      >
        <a className="brand" href="/" aria-label="Orbit 首页">
          <OrbitIcon size={30} />
          <span>
            orbit<span className="brand-period">.</span>
          </span>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        >
          <X />
        </button>
        <div className="workspace-switch">
          <label className="sr-only" htmlFor="workspace">
            工作空间
          </label>
          <span className="workspace-glyph">{workspace?.name.slice(0, 1) || 'O'}</span>
          <select
            id="workspace"
            value={wid}
            onChange={(e) => {
              setWid(e.target.value);
              setMobileNav(false);
            }}
          >
            {memberships.map((m) => (
              <option key={m.workspace.id} value={m.workspace.id}>
                {m.workspace.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => {
                setTab(id);
                setQuery('');
                setMobileNav(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'inbox' && roots.filter((x) => x.quadrant === 0).length > 0 && (
                <span className="nav-count">{roots.filter((x) => x.quadrant === 0).length}</span>
              )}
              {tab === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            hidden={!user.isSystemAdmin}
            className={`nav-item admin-nav-item ${tab === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setTab('admin');
              setMobileNav(false);
            }}
          >
            <ShieldCheck size={18} />
            系统控制台
          </button>
          <button
            className={`nav-item ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => {
              setTab('settings');
              setMobileNav(false);
            }}
          >
            <Settings size={18} />
            空间设置
          </button>
          <div className="profile">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <span>
                {role === 'owner' ? '空间所有者' : role === 'viewer' ? '只读成员' : '空间成员'}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="退出登录"
              onClick={() =>
                run('logout', async () => {
                  await api('auth/logout', 'POST');
                  setUser(null);
                  setWid('');
                  setItems([]);
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap" inert={mobileNav || undefined}>
        <header className="topbar">
          <button
            ref={tab === 'matrix' ? undefined : menuRef}
            className="mobile-menu icon-button"
            aria-expanded={mobileNav}
            aria-controls="main-navigation"
            aria-label="打开导航"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <strong>
              {tab === 'admin'
                ? '系统控制台'
                : navigation.find((n) => n.id === tab)?.label || '空间设置'}
            </strong>
          </div>
          <div className="header-right">
            <button
              className={`icon-button notification-button ${notifications.some((n) => !n.readAt) ? 'has-notifications' : ''}`}
              aria-label="通知"
              aria-expanded={showNotifications}
              onClick={() => setShowNotifications((x) => !x)}
            >
              <Bell size={19} />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'today' && (
            <>
              <section className="greeting">
                <div>
                  <h1>
                    把今天，
                    <br />
                    <span>推向前。</span>
                    <span className="heading-star" aria-hidden="true">
                      <ArrowUpRight size={80} strokeWidth={1.5} />
                    </span>
                  </h1>
                  <p>给想法一个入口，让重要的事进入轨道。</p>
                </div>
                <div className="orbit-map" aria-label={`今天已完成 ${todayDone.length} 件事项`}>
                  <svg viewBox="0 0 300 220" aria-hidden="true">
                    <ellipse cx="150" cy="110" rx="118" ry="63" transform="rotate(-27 150 110)" />
                    <ellipse cx="150" cy="110" rx="94" ry="43" transform="rotate(33 150 110)" />
                    <circle cx="150" cy="110" r="8" className="orbit-center" />
                    <circle cx="247" cy="68" r="8" className="orbit-point lime" />
                    <circle cx="78" cy="73" r="5" className="orbit-point lilac" />
                    <circle cx="78" cy="167" r="4" className="orbit-point cyan" />
                  </svg>
                  <div className="orbit-caption">
                    <span className="status-dot" />
                    今天已推进 {todayDone.length} 件事
                  </div>
                  <span className="orbit-coordinate">
                    KEEP MOVING / {String(todayDone.length).padStart(2, '0')}
                  </span>
                </div>
              </section>
              <section className="intent-stage">
                <div className="intent-heading">
                  <Sparkles size={17} />
                  <span>想到什么，就从这里开始。</span>
                  <span className="ai-tag">ORBIT AI</span>
                </div>
                <textarea
                  ref={inputRef}
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      parseIntent();
                    }
                  }}
                  placeholder="比如：周五前完成产品方案，明天下午三点提醒我…"
                  aria-label="自然语言记录事项"
                  rows={2}
                  disabled={!writable}
                />
                <div className="intent-footer">
                  <span>
                    <Command size={12} /> K 随时捕捉{' '}
                    <span className="intent-hint">· Shift + Enter 换行</span>
                  </span>
                  <div>
                    <button
                      className="text-button"
                      disabled={!writable || Boolean(busy)}
                      onClick={() => {
                        setDraft({ title: intent, notes: '', quadrant: 0, subtasks: [] });
                        setDraftFor(null);
                        setDraftMode('manual');
                      }}
                    >
                      手动记录
                    </button>
                    <button
                      className="primary-button capture-button"
                      disabled={!intent.trim() || Boolean(busy) || !writable}
                      onClick={() => parseIntent()}
                    >
                      {busy === 'capture' ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowUp size={18} />
                      )}
                      <span>进入轨道</span>
                    </button>
                  </div>
                </div>
              </section>
              <section className="focus-section">
                <div className="section-heading">
                  <h2>
                    今天的主线<span className="inline-note">FOCUS ON WHAT MATTERS</span>
                  </h2>
                  <button className="text-button" onClick={() => setTab('matrix')}>
                    全部事项 <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="focus-layout">
                  {focus[0] ? (
                    <article className={`feature-task feature-q${focus[0].quadrant}`}>
                      <div className="feature-top">
                        <span className="feature-badge">
                          <Target size={13} />
                          {quadrantNames[focus[0].quadrant]}
                        </span>
                        <button
                          className="icon-button"
                          aria-label="查看主线事项"
                          onClick={() => setSelected(focus[0])}
                        >
                          <ArrowUpRight size={21} />
                        </button>
                      </div>
                      <button className="feature-title" onClick={() => setSelected(focus[0])}>
                        {focus[0].title}
                      </button>
                      <p>{focus[0].notes || '把注意力留给它。每一步，都在改变今天。'}</p>
                      <div className="feature-bottom">
                        <span>
                          <span className="tiny-dot" />
                          {focus[0].project?.name || '独立事项'}
                        </span>
                        <button
                          className="feature-complete"
                          disabled={!writable || Boolean(busy)}
                          onClick={() => patch(focus[0], { status: 'done' })}
                        >
                          <Check size={16} />
                          完成这件事
                        </button>
                      </div>
                    </article>
                  ) : (
                    <article className="feature-task empty-feature">
                      <Target size={26} />
                      <h3>
                        新的轨道，
                        <br />
                        从一个想法开始。
                      </h3>
                      <p>写下脑海里最重要的那件事。</p>
                      <button
                        className="feature-complete"
                        onClick={() => inputRef.current?.focus()}
                      >
                        记录第一件事 <ArrowUpRight size={17} />
                      </button>
                    </article>
                  )}
                  <div className="focus-list">
                    <div className="focus-list-heading">
                      <span>接下来</span>
                      <span>{Math.max(0, focus.length - 1)} 件待推进</span>
                    </div>
                    {focus.slice(1, 5).map((x) => taskRow(x, true))}
                    {focus.length < 2 && (
                      <div className="quiet-empty">
                        <Sun size={22} />
                        <p>留一点余地，给新的可能。</p>
                      </div>
                    )}
                    <button
                      className="add-inline"
                      disabled={!writable}
                      onClick={() => {
                        setDraft({ title: '', notes: '', quadrant: 2, subtasks: [] });
                        setDraftFor(null);
                        setDraftMode('manual');
                      }}
                    >
                      <Plus size={16} />
                      再推进一件事
                    </button>
                  </div>
                </div>
              </section>
              <section className="bottom-grid">
                <div className="mini-matrix">
                  <div className="section-heading">
                    <h2>注意力分布</h2>
                    <button
                      className="icon-button"
                      aria-label="打开四象限"
                      onClick={() => setTab('matrix')}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="matrix-mini-grid">
                    {[1, 2, 3, 4].map((q) => (
                      <button
                        className={`mini-quadrant q-surface-${q}`}
                        key={q}
                        onClick={() => setTab('matrix')}
                      >
                        <span className="mini-q-label">
                          <span className={`q-dot q${q}`} />
                          {['', '立即行动', '留给重要的事', '及时响应', '给自己留白'][q]}
                        </span>
                        <strong>
                          {roots.filter((x) => x.quadrant === q).length}
                          <span>件</span>
                        </strong>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="signal-panel">
                  <div className="section-heading">
                    <h2>
                      <span className="radar-dot" />
                      Orbit 留意到
                    </h2>
                    <span className="signal-label">主动提醒</span>
                  </div>
                  {overdue.length || forgotten.length ? (
                    <>
                      <p className="signal-main">
                        有些事，值得
                        <br />
                        <span>重新放回视线。</span>
                      </p>
                      {[...new Map([...overdue, ...forgotten].map((x) => [x.id, x])).values()]
                        .slice(0, 2)
                        .map((item) => (
                          <button
                            key={item.id}
                            className="signal-item"
                            onClick={() => setSelected(item)}
                          >
                            <Clock size={15} />
                            <span>{item.title}</span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                    </>
                  ) : (
                    <>
                      <p className="signal-main">
                        重要的事，
                        <br />
                        <span>都在你的视线里。</span>
                      </p>
                      <p className="signal-copy">
                        到期与长久未处理的事项会出现在这里。
                        <br />
                        你专注推进，Orbit 帮你记得。
                      </p>
                    </>
                  )}
                  <button className="text-button" onClick={() => setTab('settings')}>
                    调整提醒节奏 <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            </>
          )}
          {tab !== 'today' && (
            <>
              {!['matrix', 'reports'].includes(tab) && (
                <div className="page-heading">
                  <div>
                    <h1>
                      {
                        (
                          {
                            matrix: '注意力，有自己的坐标。',
                            inbox: '先记下来，再理清楚。',
                            projects: '让小事，连成大事。',
                            timeline: '每一步，都算数。',
                            reports: '这一周，值得被看见。',
                            settings: '你的 Orbit，你来定义。',
                            admin: '让整个 Orbit，稳定运行。',
                          } as Record<string, string>
                        )[tab]
                      }
                    </h1>
                    <p>
                      {
                        (
                          {
                            matrix: '四象限是一副镜片，帮你看见真正重要的事。',
                            inbox: '一个安心接住所有想法的地方。',
                            projects: '把事项放进项目，让每次推进都有方向。',
                            timeline: '事项会完成，行动的记录会留下。',
                            reports: '从真实工作记录出发，每一项成果都有来源。',
                            settings: '模型、成员、提醒和开放接口，都在这里。',
                            admin: '统一管理 AI 接入，掌握系统运行与使用概况。',
                          } as Record<string, string>
                        )[tab]
                      }
                    </p>
                  </div>
                  {!['settings', 'reports', 'timeline', 'admin'].includes(tab) && (
                    <button
                      className="primary-button"
                      disabled={!writable}
                      onClick={() => {
                        setDraft({ title: '', notes: '', quadrant: 0, subtasks: [] });
                        setDraftFor(null);
                        setDraftMode('manual');
                      }}
                    >
                      <Plus size={17} />
                      记录事项
                    </button>
                  )}
                </div>
              )}
              {['inbox', 'projects', 'timeline'].includes(tab) && (
                <div className="filter-bar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="搜索事项"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索标题、内容…"
                    />
                  </div>
                  <select
                    aria-label="按项目筛选"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                  >
                    <option value="">全部项目</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="按状态筛选"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">全部状态</option>
                    {Object.entries(statuses).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {tab === 'timeline' && (
                    <>
                      <select
                        value={archiveFilter}
                        aria-label="归档状态"
                        onChange={(e) => setArchiveFilter(e.target.value)}
                      >
                        <option value="active">未归档</option>
                        <option value="archived">已归档</option>
                        <option value="deleted">已删除</option>
                        <option value="all">包括全部归档</option>
                      </select>
                      <input
                        type="date"
                        aria-label="发生日期从"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                      <input
                        type="date"
                        aria-label="发生日期至"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}
              {tab === 'matrix' && (
                <>
                  <NebulaMatrix
                    key={wid}
                    items={items.filter((item) => !item.parentId && !item.archivedAt)}
                    now={now}
                    writable={writable}
                    busy={Boolean(busy)}
                    zone={zone}
                    projects={projects}
                    immersive={matrixImmersive}
                    onImmersive={() => setMatrixImmersive((value) => !value)}
                    onMove={moveItem}
                    onComplete={(item) => patch(item, { status: 'done' })}
                    onDelete={deleteItem}
                    outcome={stellarOutcome}
                    reduced={reduced}
                    onManage={() => setMobileNav(true)}
                    menuRef={menuRef}
                    workspaceName={workspace?.name || '我的轨道'}
                    onNotifications={() => setShowNotifications((value) => !value)}
                    notificationCount={notifications.filter((n) => !n.readAt).length}
                    intent={intent}
                    onIntent={setIntent}
                    onCapture={() => parseIntent()}
                    onSelect={setSelected}
                    onAdd={(quadrant) => {
                      setDraft({ title: '', notes: '', quadrant, subtasks: [] });
                      setDraftFor(null);
                      setDraftMode('manual');
                    }}
                    onInbox={() => setTab('inbox')}
                    sediment={sedimentSummary}
                    onLoadSediment={loadSediment}
                    onBulkReschedule={bulkRescheduleSediment}
                  />
                </>
              )}
              {tab === 'inbox' && (
                <section className="list-surface">
                  {filtered.filter((x) => x.quadrant === 0).map((x) => taskRow(x))}
                  {!filtered.some((x) => x.quadrant === 0) && (
                    <Empty
                      icon={<Inbox />}
                      title="脑海腾空，灵感随时来。"
                      text="尚未分类的事项会出现在这里。"
                    />
                  )}
                </section>
              )}
              {tab === 'projects' && (
                <>
                  <ProjectCreator
                    onCreate={(input) =>
                      run('project', async () => {
                        await api(`${prefix}/projects`, 'POST', input);
                        await refresh();
                        notify('项目已创建。');
                      })
                    }
                    disabled={!writable || Boolean(busy)}
                  />
                  <div className="projects-grid">
                    {projects
                      .filter((p) => !projectFilter || p.id === projectFilter)
                      .map((p) => {
                        const ps = filtered.filter((x) => x.projectId === p.id);
                        const complete = ps.filter((x) => x.status === 'done').length;
                        return (
                          <section className="project-panel" key={p.id}>
                            <header>
                              <span className="project-symbol" style={{ color: p.color }}>
                                <Layers size={25} />
                              </span>
                              <span className="mono">
                                {complete} / {ps.length}
                              </span>
                            </header>
                            <h2>{p.name}</h2>
                            <p>{p.description || '每个小行动，都在让这个项目向前。'}</p>
                            <div className="project-progress">
                              <span
                                style={{
                                  transform: `scaleX(${ps.length ? complete / ps.length : 0})`,
                                  background: p.color,
                                }}
                              />
                            </div>
                            <div>{ps.slice(0, 8).map((x) => taskRow(x, true))}</div>
                            <button
                              className="add-inline"
                              disabled={!writable}
                              onClick={() => {
                                setDraft({
                                  title: '',
                                  notes: '',
                                  quadrant: 2,
                                  projectId: p.id,
                                  subtasks: [],
                                });
                                setDraftFor(null);
                                setDraftMode('manual');
                              }}
                            >
                              <Plus size={15} />
                              添加项目事项
                            </button>
                          </section>
                        );
                      })}
                  </div>
                  {!projects.length && (
                    <Empty
                      icon={<Layers />}
                      title="为接下来的旅程命名。"
                      text="创建第一个项目，让目标和行动连接起来。"
                    />
                  )}
                </>
              )}
              {tab === 'timeline' && (
                <>
                  <section className="list-surface history-list">
                    <div className="section-heading">
                      <h2>事项档案</h2>
                      <span>
                        {archiveTotal} 条 · 第 {archivePage} 页{archiveLoading ? ' · 加载中' : ''}
                      </span>
                    </div>
                    {archiveRows.map((x) => taskRow(x))}
                    {!archiveRows.length && !archiveLoading && (
                      <Empty
                        icon={<History />}
                        title="这一页，还等着你书写。"
                        text="调整筛选，或记录第一件事。"
                      />
                    )}
                    <div className="pagination">
                      <button
                        className="secondary-button"
                        disabled={archivePage <= 1 || archiveLoading}
                        onClick={() => setArchivePage((p) => p - 1)}
                      >
                        上一页
                      </button>
                      <button
                        className="secondary-button"
                        disabled={archivePage * 100 >= archiveTotal || archiveLoading}
                        onClick={() => setArchivePage((p) => p + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  </section>
                  <section className="event-log">
                    <div className="section-heading">
                      <h2>行动回放</h2>
                      <span>最近 200 条 · 完整历史可导出</span>
                    </div>
                    {events
                      .filter((e) => !isPositionOnlyEvent(e))
                      .filter((e) => !query || e.item?.title.includes(query))
                      .filter((e) => !projectFilter || e.item?.projectId === projectFilter)
                      .map((e) => (
                        <div className="event" key={e.id}>
                          <span className="event-dot" />
                          <time>{shortDate(e.createdAt, zone)}</time>
                          <span>{eventsLabel[e.type] || e.type}</span>
                          {e.itemId ? (
                            <button onClick={() => openItem(e.itemId!)}>
                              {e.item?.title || e.itemId}
                              <ArrowUpRight size={13} />
                            </button>
                          ) : (
                            <span className="muted">空间操作</span>
                          )}
                        </div>
                      ))}
                  </section>
                </>
              )}
              {tab === 'reports' && (
                <ReportFoundry
                  key={wid}
                  wid={wid}
                  zone={zone}
                  userId={user!.id}
                  writable={writable}
                  request={api}
                  onOpen={openItem}
                  onChanged={refresh}
                  reportTarget={reportTarget}
                  sourceRevision={items.map((i) => `${i.id}:${i.version}`).join(',')}
                  notify={notify}
                />
              )}
              {tab === 'settings' && (
                <SettingsPanel
                  key={wid}
                  config={config}
                  prefix={prefix}
                  wid={wid}
                  isAdmin={isAdmin}
                  reduced={reduced}
                  disabled={Boolean(busy)}
                  onReduced={(value) => {
                    setReduced(value);
                    localStorage.setItem('orbit.reduced', String(value));
                  }}
                  run={run}
                  refresh={refresh}
                  notify={notify}
                  newWorkspace={async (name) => {
                    const space = await api<Workspace>('workspaces', 'POST', {
                      name,
                      timezone: zone,
                    });
                    await boot();
                    setWid(space.id);
                  }}
                />
              )}
              {tab === 'admin' && user.isSystemAdmin && (
                <AdminPanel disabled={Boolean(busy)} run={run} notify={notify} />
              )}
            </>
          )}
          {!['matrix', 'reports'].includes(tab) && (
            <footer className="app-footer">
              <span>
                <OrbitIcon size={13} /> KEEP YOUR WORLD IN MOTION.
              </span>
              <button className="text-button" onClick={() => setTab('settings')}>
                Orbit / v0.1
              </button>
            </footer>
          )}
        </main>
      </div>
      {writable && !['matrix', 'admin', 'reports'].includes(tab) && (
        <div className="capture-dock">
          <button
            className={`floating-capture ${tab === 'today' ? 'mobile-capture' : ''}`}
            aria-label="快速记录事项"
            onClick={() => {
              setDraft({ title: '', notes: '', quadrant: 0, subtasks: [] });
              setDraftFor(null);
              setDraftMode('manual');
            }}
          >
            <Plus size={22} />
            <span>捕捉想法</span>
          </button>
        </div>
      )}
      {draft && (
        <DraftPanel
          key={draftFor?.id || 'new'}
          initial={draft}
          mode={draftMode}
          editing={Boolean(draftFor)}
          projects={projects}
          zone={zone}
          busy={Boolean(busy)}
          onClose={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}
      {selected && !draft && (
        <DetailPanel
          key={`${selected.id}:${selected.version}`}
          item={selected}
          projects={projects}
          items={items}
          zone={zone}
          events={selectedEvents}
          writable={writable}
          busy={Boolean(busy)}
          onClose={() => setSelected(null)}
          onSave={(changes) => patch(selected, changes)}
          onDelete={() => deleteItem(selected)}
          onRestore={() => restoreItem(selected)}
          onReport={(id) => {
            setReportTarget(id);
            setTab('reports');
            setSelected(null);
          }}
          onSelect={setSelected}
          onSnooze={() =>
            run('snooze', async () => {
              await api(`${prefix}/items/${selected.id}/snooze`, 'POST', { minutes: 60 });
              notify('好的，一小时后提醒你。');
              await refresh();
            })
          }
          onAI={() =>
            run('decompose', async () => {
              const result = await api<{ draft: CaptureDraft; mode: string; message: string }>(
                `${prefix}/ai`,
                'POST',
                { itemId: selected.id, skillId: 'break-down-task' },
              );
              setDraft(result.draft);
              setDraftFor(selected);
              setDraftMode(result.mode);
              if (result.mode !== 'ai') notify(result.message);
            })
          }
        />
      )}
      {undoDeleted && (
        <div className="deletion-toast" role="status">
          <span>已删除「{undoDeleted.title}」</span>
          <button disabled={Boolean(busy)} onClick={() => restoreItem(undoDeleted)}>
            撤销删除
          </button>
          <button aria-label="关闭删除提示" onClick={() => setUndoDeleted(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {showNotifications && (
        <div className="notifications-popover">
          <header>
            <h2>Orbit 信号</h2>
            <button
              className="icon-button"
              aria-label="关闭通知"
              onClick={() => setShowNotifications(false)}
            >
              <X size={17} />
            </button>
          </header>
          {notifications.map((n) => (
            <button
              key={n.id}
              className={`notification-row ${n.readAt ? 'read' : ''}`}
              onClick={() =>
                run('notification', async () => {
                  await api(`${prefix}/notifications/read`, 'POST', { id: n.id });
                  if (n.itemId) await openItem(n.itemId);
                  await refresh();
                })
              }
            >
              <span className="q-dot q2" />
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <time>{shortDate(n.createdAt, zone)}</time>
                {n.lastError && <small>外部通知待重试</small>}
              </div>
            </button>
          ))}
          {!notifications.length && (
            <Empty
              icon={<Bell />}
              title="此刻，一切安静。"
              text="事项到期、晨间简报和遗忘提示会在这里汇合。"
            />
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {celebration && (
        <div className="celebration" role="status">
          <div className="celebration-emblem">
            <CheckCheck size={38} />
          </div>
          <div>
            <span>又向前了一步。</span>
            <strong>{celebration}</strong>
          </div>
          {!reduced &&
            Array.from({ length: 22 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    '--angle': `${(i * 360) / 22}deg`,
                    '--distance': `${90 + (i % 4) * 22}px`,
                    '--delay': `${(i % 3) * 35}ms`,
                    '--color': ['#d7ff4f', '#a78bfa', '#76def7', '#ff946f'][i % 4],
                  } as CSSProperties
                }
              />
            ))}
        </div>
      )}
    </div>
  );
}
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Auth({
  onSuccess,
  initialError,
}: {
  onSuccess: () => Promise<void>;
  initialError: string;
}) {
  const [register, setRegister] = useState(false),
    [canRegister, setCanRegister] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(initialError),
    [pending, setPending] = useState(false);
  useEffect(() => {
    api<{ bootstrap: boolean; registrationAllowed: boolean }>('auth/status')
      .then((s) => {
        setCanRegister(s.bootstrap || s.registrationAllowed);
        setRegister(s.bootstrap);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-art">
        <a className="brand" href="/">
          <OrbitIcon size={34} />
          <span>orbit.</span>
        </a>
        <div>
          <h1>
            重要的事，
            <br />
            值得一个
            <br />
            <em>好轨道。</em>
          </h1>
          <p>
            你的想法，你的节奏。
            <br />
            一个会主动记得的 AI 工作空间。
          </p>
        </div>
        <svg viewBox="0 0 600 270" aria-hidden="true">
          <ellipse cx="300" cy="135" rx="250" ry="75" transform="rotate(-16 300 135)" />
          <ellipse cx="300" cy="135" rx="200" ry="60" transform="rotate(25 300 135)" />
          <circle cx="492" cy="74" r="14" />
          <circle cx="300" cy="135" r="9" />
        </svg>
        <span className="auth-foot">KEEP YOUR WORLD IN MOTION.</span>
      </section>
      <section className="auth-form">
        <div className="mobile-brand">
          <OrbitIcon /> orbit.
        </div>
        <h2>{register ? '开启你的轨道。' : '回到你的轨道。'}</h2>
        <p>{register ? '创建账号，记录第一件重要的事。' : '欢迎回来。让今天继续向前。'}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setError('');
            try {
              await api(`auth/${register ? 'register' : 'login'}`, 'POST', {
                email,
                password,
                ...(register ? { name } : {}),
              });
              await onSuccess();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          {register && (
            <label>
              如何称呼你
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的名字"
              />
            </label>
          )}
          <label>
            邮箱
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            密码
            <input
              required
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 10 位字符"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={pending}>
            {pending ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{' '}
            {register ? '创建账号' : '进入 Orbit'}
          </button>
        </form>
        {canRegister && (
          <button className="text-button auth-switch" onClick={() => setRegister((x) => !x)}>
            {register ? '已有账号？登录' : '还没有账号？创建一个'}
          </button>
        )}
        <div className="auth-note">
          <span className="status-dot" />
          自托管 · 数据属于你的工作空间
        </div>
      </section>
    </main>
  );
}
function Panel({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
        ) || [],
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = focusable();
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0]?.focus();
      }
    };
    const element = ref.current;
    element?.addEventListener('keydown', trap);
    return () => {
      element?.removeEventListener('keydown', trap);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="panel-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        ref={ref}
      >
        <header>
          <div>
            <h2 id="panel-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="关闭面板" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function DraftPanel({
  initial,
  mode,
  editing,
  projects,
  zone,
  busy,
  onClose,
  onSave,
}: {
  initial: CaptureDraft;
  mode: string;
  editing: boolean;
  projects: Project[];
  zone: string;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: CaptureDraft) => void;
}) {
  const [value, setValue] = useState(initial),
    [subtasks, setSubtasks] = useState(initial.subtasks.join('\n'));
  return (
    <Panel
      title={editing ? '把下一步，变清楚。' : '让想法，进入轨道。'}
      subtitle={
        mode === 'ai'
          ? 'AI 已整理 · 由你做最后确认'
          : mode === 'rules'
            ? '规则草稿 · 请核对日期与分类'
            : '手动记录 · 保留每一个重要细节'
      }
      onClose={onClose}
    >
      <form
        className="panel-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...value,
            subtasks: subtasks
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          });
        }}
      >
        <label>
          事项名称
          <input
            required
            maxLength={240}
            value={value.title}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
            placeholder="此刻，你想推进什么？"
          />
        </label>
        <label>
          补充说明
          <textarea
            value={value.notes}
            onChange={(e) => setValue({ ...value, notes: e.target.value })}
            rows={3}
            placeholder="背景、想法、链接…"
          />
        </label>
        <div className="form-grid">
          <label>
            注意力坐标
            <select
              value={value.quadrant}
              onChange={(e) => setValue({ ...value, quadrant: Number(e.target.value) })}
            >
              {quadrantNames.map((name, i) => (
                <option key={name} value={i}>
                  {i ? `Q${i} · ` : ''}
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            所属项目
            <select
              value={value.projectId || ''}
              onChange={(e) => setValue({ ...value, projectId: e.target.value || null })}
            >
              <option value="">独立事项</option>
              {projects.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            截止时间
            <input
              type="datetime-local"
              value={inputDate(value.dueAt || null, zone)}
              onChange={(e) => setValue({ ...value, dueAt: fromInput(e.target.value, zone) })}
            />
          </label>
          <label>
            提醒时间
            <input
              type="datetime-local"
              value={inputDate(value.reminderAt || null, zone)}
              onChange={(e) => setValue({ ...value, reminderAt: fromInput(e.target.value, zone) })}
            />
          </label>
        </div>
        <p className="field-note">时间按工作空间时区 {zone} 保存。</p>
        <label>
          拆成小步 <span className="muted">每行一个，最多 12 个</span>
          <textarea
            rows={4}
            value={subtasks}
            onChange={(e) => setSubtasks(e.target.value)}
            placeholder="先明确目标\n准备所需材料\n完成第一版"
          />
        </label>
        <div className="panel-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            再想想
          </button>
          <button className="primary-button" disabled={busy || !value.title.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUpRight size={17} />}确认
            {editing ? '更新' : '记录'}
          </button>
        </div>
      </form>
    </Panel>
  );
}
function DetailPanel({
  item,
  projects,
  items,
  events,
  zone,
  writable,
  busy,
  onClose,
  onSave,
  onSelect,
  onSnooze,
  onAI,
  onDelete,
  onRestore,
  onReport,
}: {
  item: Item;
  projects: Project[];
  items: Item[];
  events: Event[];
  zone: string;
  writable: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onSelect: (item: Item) => void;
  onSnooze: () => void;
  onAI: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onReport: (id: string) => void;
}) {
  const [title, setTitle] = useState(item.title),
    [notes, setNotes] = useState(item.notes),
    [quadrant, setQuadrant] = useState(item.quadrant),
    [projectId, setProjectId] = useState(item.projectId || ''),
    [confirmDelete, setConfirmDelete] = useState(false),
    [dueAt, setDueAt] = useState(inputDate(item.dueAt, zone)),
    [occurredAt, setOccurredAt] = useState(inputDate(item.occurredAt, zone)),
    [reminderAt, setReminderAt] = useState(
      inputDate(item.reminders?.[0]?.scheduledAt || null, zone),
    );
  return (
    <Panel
      title="事项详情"
      subtitle={`记录于 ${shortDate(item.createdAt, zone)} · v${item.version}`}
      onClose={onClose}
    >
      {item.deletedAt && (
        <div className="deleted-notice">
          此事项已删除，历史记录仍在。
          {writable && (
            <button className="secondary-button" disabled={busy} onClick={onRestore}>
              恢复已删除事项
            </button>
          )}
        </div>
      )}
      {item.sourceReportId && (
        <section className="detail-section report-origin">
          <p>由下周计划进入轨道</p>
          <button className="text-button" onClick={() => onReport(item.sourceReportId!)}>
            查看来源周报 <ArrowUpRight size={14} />
          </button>
        </section>
      )}
      {!item.deletedAt && (
        <section className="detail-status-switcher" aria-labelledby="detail-status-title">
          <div className="detail-status-heading">
            <div>
              <span id="detail-status-title">当前航行状态</span>
              <strong>
                {statusOptions.find((option) => option.value === item.status)?.cosmic}
              </strong>
            </div>
            <small>点击即可切换</small>
          </div>
          <div className="detail-status-track" role="group" aria-label="快速切换事项状态">
            {statusOptions.map((option) => {
              const Icon = option.icon;
              const active = item.status === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`detail-status-option is-${option.value} ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                  disabled={!writable || busy}
                  onClick={() => {
                    if (!active) onSave({ status: option.value });
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <form
        className="panel-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title,
            notes,
            quadrant,
            projectId: projectId || null,
            dueAt: fromInput(dueAt, zone),
            occurredAt: fromInput(occurredAt, zone),
            reminderAt: fromInput(reminderAt, zone),
          });
        }}
      >
        <label>
          事项名称
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!writable || Boolean(item.deletedAt)}
          />
        </label>
        <label>
          说明
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!writable || Boolean(item.deletedAt)}
          />
        </label>
        <details className="detail-disclosure" open>
          <summary>
            <span>分类与时间</span>
            <small>
              {quadrantNames[quadrant]} ·{' '}
              {projects.find((project) => project.id === projectId)?.name || '独立事项'}
            </small>
          </summary>
          <div className="form-grid">
            <label>
              象限
              <select
                value={quadrant}
                onChange={(e) => setQuadrant(Number(e.target.value))}
                disabled={!writable || Boolean(item.deletedAt)}
              >
                {quadrantNames.map((label, i) => (
                  <option value={i} key={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              项目
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!writable || Boolean(item.deletedAt)}
              >
                <option value="">独立事项</option>
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              发生时间
              <input
                required
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                disabled={!writable || Boolean(item.deletedAt)}
              />
            </label>
            <label>
              截止时间
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                disabled={!writable || Boolean(item.deletedAt)}
              />
            </label>
            <label>
              提醒时间
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                disabled={!writable || Boolean(item.deletedAt)}
              />
            </label>
          </div>
        </details>
        <div className="panel-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onAI}
            disabled={!writable || Boolean(item.deletedAt) || busy}
          >
            <Sparkles size={15} />
            AI 拆解
          </button>
          <button
            className="primary-button"
            disabled={!writable || Boolean(item.deletedAt) || busy}
          >
            保存修改 <Check size={16} />
          </button>
        </div>
        <details className="detail-disclosure detail-more-actions">
          <summary>更多操作</summary>
          <div className="detail-utilities">
            <button
              type="button"
              className="text-button"
              disabled={
                !writable ||
                Boolean(item.deletedAt) ||
                busy ||
                item.status === 'done' ||
                Boolean(item.archivedAt)
              }
              onClick={onSnooze}
            >
              <Clock size={14} />
              一小时后提醒
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!writable || Boolean(item.deletedAt) || busy}
              onClick={() => onSave({ archived: !item.archivedAt })}
            >
              {item.archivedAt ? <Undo2 size={14} /> : <Archive size={14} />}{' '}
              {item.archivedAt ? '恢复事项' : '归档保留'}
            </button>
          </div>
        </details>
      </form>
      {writable && !item.deletedAt && (
        <details className="detail-danger-disclosure">
          <summary
            aria-label={`删除事项${item.parentId ? '' : '及子事项'}`}
            onClick={() => setConfirmDelete(true)}
          >
            删除事项{item.parentId ? '' : '及子事项'}
          </summary>
          <section className={`detail-danger ${confirmDelete ? 'is-confirming' : ''}`}>
            <div className="detail-danger-copy">
              <span className="detail-danger-icon" aria-hidden="true">
                <Trash2 size={16} />
              </span>
              <div>
                <h3>移出当前宇宙</h3>
                <p>
                  {item.parentId
                    ? '删除后将停止提醒，并可从时光回放恢复。'
                    : `删除后将停止提醒${items.some((child) => child.parentId === item.id) ? '，子事项也会一同移出' : ''}，仍可从时光回放恢复。`}
                </p>
              </div>
            </div>
            {confirmDelete ? (
              <div className="detail-danger-confirm" role="group" aria-label="确认删除事项">
                <span>确认删除这颗星体？</span>
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="delete-item-button is-confirm"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    <Trash2 size={14} />
                    确认删除
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="delete-item-button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} />
                删除事项{item.parentId ? '' : '及子事项'}
              </button>
            )}
          </section>
        </details>
      )}
      {items.some((child) => child.parentId === item.id) && (
        <section className="detail-section">
          <h3>小步前进</h3>
          {items
            .filter((x) => x.parentId === item.id)
            .map((child) => (
              <button key={child.id} className="child-item" onClick={() => onSelect(child)}>
                {child.status === 'done' ? <Check size={15} /> : <ChevronRight size={15} />}{' '}
                {child.title}
              </button>
            ))}
        </section>
      )}
      <details className="detail-history">
        <summary>行动足迹 · {events.length}</summary>
        <div>
          {events.map((e) => (
            <div className="detail-event" key={e.id}>
              <span>{eventsLabel[e.type] || e.type}</span>
              <time>{shortDate(e.createdAt, zone)}</time>
            </div>
          ))}
          {item.completedAt && <p>完成时间：{shortDate(item.completedAt, zone)}</p>}
        </div>
      </details>
    </Panel>
  );
}
function ProjectCreator({
  onCreate,
  disabled,
}: {
  onCreate: (value: { name: string; description: string; color: string }) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [color, setColor] = useState('#d7ff4f');
  return (
    <div className="project-creator">
      <button className="secondary-button" disabled={disabled} onClick={() => setOpen((x) => !x)}>
        <Plus size={16} />
        新建项目
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ name, description, color });
            setName('');
            setDescription('');
            setOpen(false);
          }}
        >
          <input
            required
            placeholder="项目名称"
            aria-label="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="想达成什么？"
            aria-label="项目目标"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="color"
            aria-label="项目颜色"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <button className="primary-button" disabled={disabled}>
            创建项目
          </button>
        </form>
      )}
    </div>
  );
}
function ReportStudio({
  reports,
  zone,
  items,
  disabled,
  onOpen,
  onGenerate,
  onSave,
  notify,
}: {
  reports: Report[];
  zone: string;
  items: Item[];
  disabled: boolean;
  onOpen: (id: string) => void;
  onGenerate: (value: { startAt: string; endAt: string }) => void;
  onSave: (id: string, text: string) => void;
  notify: (text: string) => void;
}) {
  const [start, setStart] = useState(() =>
      new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10),
    ),
    [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10)),
    [selectedId, setSelectedId] = useState(''),
    [content, setContent] = useState('');
  const report = reports.find((r) => r.id === selectedId) || reports[0];
  useEffect(() => {
    setContent(report?.content || '');
  }, [report?.id, report?.content]);
  return (
    <>
      <form
        className="report-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate({
            startAt: zonedInstant(start, '00:00', zone),
            endAt: zonedInstant(end, '00:00', zone),
          });
          setSelectedId('');
        }}
      >
        <label>
          开始日期
          <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          结束日期（不含）
          <input
            required
            type="date"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <button className="primary-button" disabled={disabled || end <= start}>
          <Sparkles size={17} />
          生成有来源的周报
        </button>
      </form>
      {report ? (
        <div className="report-studio">
          <aside>
            <h3>已保存草稿</h3>
            {reports.map((r) => (
              <button
                key={r.id}
                className={report.id === r.id ? 'selected' : ''}
                onClick={() => setSelectedId(r.id)}
              >
                <FileText size={16} />
                <span>
                  {r.startAt.slice(0, 10)}
                  <small>{r.sourceIds.length} 条来源事项</small>
                </span>
              </button>
            ))}
          </aside>
          <section className="report-document">
            <header>
              <span>Markdown · 可编辑</span>
              <div>
                <button
                  className="icon-button"
                  aria-label="复制周报"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(content)
                      .then(() => notify('已复制周报。'))
                      .catch(() => notify('复制失败，请手动选择文本。'))
                  }
                >
                  <Copy size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="下载周报"
                  onClick={() =>
                    download(
                      `orbit-report-${report.startAt.slice(0, 10)}.md`,
                      content,
                      'text/markdown',
                    )
                  }
                >
                  <Download size={16} />
                </button>
                <button
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() => onSave(report.id, content)}
                >
                  保存草稿
                </button>
              </div>
            </header>
            <textarea
              aria-label="周报内容"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={disabled}
            />
            <div className="report-sources">
              <h3>回到真实的行动</h3>
              {report.sourceIds.map((id) => {
                const item = items.find((i) => i.id === id);
                return (
                  <button key={id} onClick={() => onOpen(id)}>
                    {item?.title || '查看已归档的来源事项'}
                    <ArrowUpRight size={13} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <Empty
          icon={<FileText />}
          title="成果已经发生，只差一次回顾。"
          text="选择日期范围，从真实的事项与事件历史生成草稿。"
        />
      )}
    </>
  );
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const emptyEndpoint = {
  name: '',
  provider: 'openai',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Qwen/Qwen3-8B',
  apiKey: '',
  active: true,
};

function AdminPanel({
  disabled,
  run,
  notify,
}: {
  disabled: boolean;
  run: (label: string, work: () => Promise<void>) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [endpoints, setEndpoints] = useState<AIEndpointView[]>([]);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyEndpoint);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOverview, nextEndpoints] = await Promise.all([
        api<AdminOverview>('admin/overview'),
        api<AIEndpointView[]>('admin/ai-endpoints'),
      ]);
      setOverview(nextOverview);
      setEndpoints(nextEndpoints);
      setLoadError('');
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editingId && endpoints.length) {
      const endpoint = endpoints.find((item) => item.active) || endpoints[0];
      setEditingId(endpoint.id);
      setForm({
        name: endpoint.name,
        provider: endpoint.provider,
        baseUrl: endpoint.baseUrl,
        model: endpoint.model,
        apiKey: '',
        active: endpoint.active,
      });
    }
  }, [editingId, endpoints]);

  const selectEndpoint = (endpoint: AIEndpointView) => {
    setEditingId(endpoint.id);
    setConfirmDelete('');
    setForm({
      name: endpoint.name,
      provider: endpoint.provider,
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      apiKey: '',
      active: endpoint.active,
    });
  };
  const startNew = () => {
    setEditingId('');
    setConfirmDelete('');
    setForm(emptyEndpoint);
  };
  const maxActivity = Math.max(
    1,
    ...(overview?.activity.map((day) => Math.max(day.created, day.completed)) || [1]),
  );
  const aiTotal = (overview?.totals.aiSucceeded || 0) + (overview?.totals.aiFailed || 0);
  const aiRate = aiTotal ? Math.round(((overview?.totals.aiSucceeded || 0) / aiTotal) * 100) : 100;

  if (loading && !overview) return <div className="admin-loading">正在读取系统轨道…</div>;
  return (
    <div className="admin-console">
      {loadError && <div className="error-banner">{loadError}</div>}
      {overview && (
        <>
          <section className="admin-metric-strip" aria-label="系统概览">
            <div>
              <span>注册用户</span>
              <strong>{overview.totals.users}</strong>
              <small>{overview.totals.activeUsers} 个有效会话</small>
            </div>
            <div>
              <span>工作空间</span>
              <strong>{overview.totals.workspaces}</strong>
              <small>数据按空间隔离</small>
            </div>
            <div>
              <span>轨道中</span>
              <strong>{overview.totals.openItems}</strong>
              <small>{overview.totals.overdueItems} 件已逾期</small>
            </div>
            <div>
              <span>近 7 天完成</span>
              <strong>{overview.totals.completedItems}</strong>
              <small>{overview.totals.reports} 份周报</small>
            </div>
            <div className="admin-ai-metric">
              <span>AI 成功率</span>
              <strong>{aiRate}%</strong>
              <small>{overview.activeEndpoint?.name || '尚无激活端点'}</small>
            </div>
          </section>

          <section className="admin-pulse">
            <div className="admin-section-heading">
              <div>
                <h2>
                  <Activity size={19} /> 七日行动脉冲
                </h2>
                <p>记录与完成的真实变化</p>
              </div>
              <button className="icon-button" onClick={load} aria-label="刷新系统数据">
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
              </button>
            </div>
            <div className="admin-activity-chart" aria-label="最近七天事项创建与完成数量">
              {overview.activity.map((day) => (
                <div className="admin-day" key={day.date}>
                  <div className="admin-bars">
                    <span
                      className="created"
                      style={{ height: `${Math.max(4, (day.created / maxActivity) * 100)}%` }}
                      title={`创建 ${day.created}`}
                    />
                    <span
                      className="completed"
                      style={{ height: `${Math.max(4, (day.completed / maxActivity) * 100)}%` }}
                      title={`完成 ${day.completed}`}
                    />
                  </div>
                  <strong>{day.date.slice(5).replace('-', '/')}</strong>
                  <small>
                    {day.created} / {day.completed}
                  </small>
                </div>
              ))}
            </div>
            <div className="admin-chart-legend">
              <span>
                <i className="created" />
                新记录
              </span>
              <span>
                <i className="completed" />
                已完成
              </span>
            </div>
          </section>
        </>
      )}

      <section className="admin-endpoints">
        <div className="admin-section-heading">
          <div>
            <h2>
              <Server size={19} /> AI 接入端点
            </h2>
            <p>当前激活端点服务所有工作空间，密钥只以密文保存。</p>
          </div>
          <button className="secondary-button" onClick={startNew}>
            <Plus size={15} /> 新增端点
          </button>
        </div>
        <div className="endpoint-workbench">
          <div className="endpoint-list" aria-label="AI 端点列表">
            {endpoints.map((endpoint) => (
              <button
                key={endpoint.id}
                className={editingId === endpoint.id ? 'is-selected' : ''}
                onClick={() => selectEndpoint(endpoint)}
              >
                <span className={endpoint.active ? 'online-dot' : 'idle-dot'} />
                <span>
                  <strong>{endpoint.name}</strong>
                  <small>{endpoint.model}</small>
                </span>
                {endpoint.active && <em>当前</em>}
              </button>
            ))}
            {!endpoints.length && <p>还没有端点。创建后，Orbit 才会调用 AI 模型。</p>}
          </div>
          <form
            className="endpoint-editor"
            onSubmit={(event) => {
              event.preventDefault();
              run('admin-endpoint-save', async () => {
                const payload = {
                  name: form.name,
                  provider: form.provider,
                  baseUrl: form.baseUrl,
                  model: form.model,
                  active: form.active,
                  ...(form.apiKey ? { apiKey: form.apiKey } : {}),
                };
                await api(
                  editingId ? `admin/ai-endpoints/${editingId}` : 'admin/ai-endpoints',
                  editingId ? 'PATCH' : 'POST',
                  payload,
                );
                setForm((current) => ({ ...current, apiKey: '' }));
                notify(editingId ? 'AI 端点已更新。' : 'AI 端点已创建。');
                await load();
              });
            }}
          >
            <div className="endpoint-editor-title">
              <div>
                <strong>{editingId ? '编辑端点' : '连接新端点'}</strong>
                <span>{editingId ? '修改会立即影响后续 AI 调用' : '创建后可随时切换'}</span>
              </div>
              {editingId && endpoints.find((item) => item.id === editingId)?.hasKey && (
                <span className="key-status">
                  <KeyRound size={12} /> 密钥已保存
                </span>
              )}
            </div>
            <div className="form-grid">
              <label>
                端点名称
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="如：硅基流动主端点"
                />
              </label>
              <label>
                接口类型
                <select
                  value={form.provider}
                  onChange={(event) => setForm({ ...form, provider: event.target.value })}
                >
                  <option value="openai">OpenAI-compatible</option>
                  <option value="ollama">Ollama 原生</option>
                </select>
              </label>
            </div>
            <label>
              服务地址
              <input
                required
                type="url"
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <div className="form-grid">
              <label>
                模型名称
                <input
                  required
                  value={form.model}
                  onChange={(event) => setForm({ ...form, model: event.target.value })}
                  placeholder="服务商中的完整模型 ID"
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder={editingId ? '留空则保留现有密钥' : '按服务商要求填写'}
                />
              </label>
            </div>
            <label className="toggle-row endpoint-active-toggle">
              <span>
                设为当前端点<small>开启后，其他端点自动转为待命</small>
              </span>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
            </label>
            <div className="endpoint-actions">
              <button className="primary-button" disabled={disabled}>
                <Save size={15} /> {editingId ? '保存端点' : '创建端点'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={disabled}
                  onClick={() =>
                    run('admin-endpoint-test', async () => {
                      const result = await api<{ latencyMs: number }>(
                        `admin/ai-endpoints/${editingId}/test`,
                        'POST',
                        {},
                      );
                      notify(`连接成功，响应约 ${result.latencyMs} ms。`);
                    })
                  }
                >
                  <Play size={14} /> 测试连接
                </button>
              )}
              {editingId && (
                <button
                  type="button"
                  className="text-button endpoint-delete"
                  disabled={disabled}
                  onClick={() => {
                    if (confirmDelete !== editingId) {
                      setConfirmDelete(editingId);
                      return;
                    }
                    run('admin-endpoint-delete', async () => {
                      await api(`admin/ai-endpoints/${editingId}`, 'DELETE');
                      notify('AI 端点已移除。');
                      startNew();
                      await load();
                    });
                  }}
                >
                  <Trash2 size={14} />
                  {confirmDelete === editingId ? '确认移除' : '移除端点'}
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {overview && (
        <section className="admin-users">
          <div className="admin-section-heading">
            <div>
              <h2>
                <Users size={19} /> 最近加入
              </h2>
              <p>最近创建的五个账号</p>
            </div>
          </div>
          <div className="admin-user-list">
            {overview.recentUsers.map((recentUser) => (
              <div key={recentUser.id}>
                <span className="avatar small">{recentUser.name.slice(0, 1)}</span>
                <span>
                  <strong>{recentUser.name}</strong>
                  <small>{recentUser.email}</small>
                </span>
                {recentUser.isSystemAdmin && (
                  <em>
                    <ShieldCheck size={12} /> 系统管理员
                  </em>
                )}
                <time>
                  {new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(
                    new Date(recentUser.createdAt),
                  )}
                </time>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsPanel({
  config,
  prefix,
  wid,
  isAdmin,
  reduced,
  disabled,
  onReduced,
  run,
  refresh,
  notify,
  newWorkspace,
}: {
  config: Config | null;
  prefix: string;
  wid: string;
  isAdmin: boolean;
  reduced: boolean;
  disabled: boolean;
  onReduced: (value: boolean) => void;
  run: (label: string, work: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (text: string) => void;
  newWorkspace: (name: string) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState<Preferences>(config?.preferences || defaultPrefs),
    [spaceName, setSpaceName] = useState('');
  const [members, setMembers] = useState<
      { id: string; role: string; user: { name: string; email: string } }[]
    >([]),
    [tokens, setTokens] = useState<
      { id: string; name: string; scopes: string[]; revokedAt: string | null; expiresAt: string }[]
    >([]),
    [tokenName, setTokenName] = useState(''),
    [tokenWrite, setTokenWrite] = useState(false),
    [newToken, setNewToken] = useState('');
  const [memberEmail, setMemberEmail] = useState(''),
    [memberPassword, setMemberPassword] = useState(''),
    [memberRole, setMemberRole] = useState('member');
  const configVersion = JSON.stringify(config);
  useEffect(() => {
    if (config) setPrefs(config.preferences || defaultPrefs);
  }, [configVersion]);
  const load = useCallback(async () => {
    setMembers(await api(`${prefix}/members`));
    if (isAdmin) setTokens(await api(`${prefix}/tokens`));
  }, [prefix, isAdmin]);
  useEffect(() => {
    load().catch((e) => notify(e.message));
  }, [load]);
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window))
      throw new Error('当前浏览器不支持推送。iPhone 请先添加 Orbit 到主屏幕后打开。');
    if (!config?.vapidPublicKey) throw new Error('服务器尚未配置 VAPID 推送密钥');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('浏览器通知权限未开启');
    const registration = await navigator.serviceWorker.ready;
    const key = config.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    await api(`${prefix}/notifications/subscribe`, 'POST', subscription.toJSON());
    setPrefs((current) => ({ ...current, pushEnabled: true }));
    await api(`${prefix}/settings/notifications`, 'POST', { ...prefs, pushEnabled: true });
    notify('当前设备已开启推送。');
    await refresh();
  }
  return (
    <div className="settings-grid">
      <section className="settings-section">
        <h2>
          <SlidersHorizontal size={20} />
          你的提醒节奏
        </h2>
        <p>重要的时刻出现，其余时间保持安静。</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('preferences', async () => {
              const {
                pushEnabled,
                emailEnabled,
                quietStart,
                quietEnd,
                morningHour,
                morningEnabled,
                dailyLimit,
                pausedUntil,
              } = prefs;
              await api(`${prefix}/settings/notifications`, 'POST', {
                pushEnabled,
                emailEnabled,
                quietStart,
                quietEnd,
                morningHour,
                morningEnabled,
                dailyLimit,
                pausedUntil,
              });
              notify('提醒节奏已保存。');
              await refresh();
            });
          }}
        >
          <label className="toggle-row">
            <span>
              晨间简报<small>每天为重要的事留一个开场</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.morningEnabled}
              onChange={(e) => setPrefs({ ...prefs, morningEnabled: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>
              邮件提醒
              <small>{config?.smtpConfigured ? '邮件服务已配置' : '需要服务器配置 SMTP'}</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>
              浏览器推送<small>需要为当前设备授予通知权限</small>
            </span>
            <input
              type="checkbox"
              checked={prefs.pushEnabled}
              onChange={(e) => {
                if (e.target.checked) run('push', enablePush);
                else setPrefs({ ...prefs, pushEnabled: false });
              }}
            />
          </label>
          <div className="form-grid">
            <label>
              安静时段 · 开始
              <select
                value={prefs.quietStart}
                onChange={(e) => setPrefs({ ...prefs, quietStart: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              安静时段 · 结束
              <select
                value={prefs.quietEnd}
                onChange={(e) => setPrefs({ ...prefs, quietEnd: Number(e.target.value) })}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              晨间简报时间
              <input
                type="number"
                min={0}
                max={23}
                value={prefs.morningHour}
                onChange={(e) => setPrefs({ ...prefs, morningHour: Number(e.target.value) })}
              />
            </label>
            <label>
              每日外部提醒上限
              <input
                type="number"
                min={1}
                max={20}
                value={prefs.dailyLimit}
                onChange={(e) => setPrefs({ ...prefs, dailyLimit: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="toggle-row">
            <span>
              暂停 24 小时<small>应用内信号仍保留</small>
            </span>
            <input
              type="checkbox"
              checked={Boolean(prefs.pausedUntil && new Date(prefs.pausedUntil) > new Date())}
              onChange={(e) =>
                setPrefs({
                  ...prefs,
                  pausedUntil: e.target.checked ? new Date(Date.now() + 864e5).toISOString() : null,
                })
              }
            />
          </label>
          <button className="secondary-button" disabled={disabled}>
            保存提醒设置
          </button>
        </form>
      </section>
      <section className="settings-section">
        <h2>
          <Sparkles size={20} />
          Orbit AI
        </h2>
        <p>模型能力由系统统一接入，工作空间无需保存或共享密钥。</p>
        <div className={`ai-service-status ${config?.aiConfigured ? 'is-online' : ''}`}>
          <span className={config?.aiConfigured ? 'online-dot' : 'idle-dot'} />
          <div>
            <strong>{config?.aiConfigured ? 'AI 服务在线' : 'AI 服务尚未接入'}</strong>
            <small>
              {config?.ai
                ? `${config.ai.provider === 'ollama' ? 'Ollama' : 'OpenAI-compatible'} · ${config.ai.model}`
                : '自然语言输入会自动使用规则模式'}
            </small>
          </div>
        </div>
        <div className="setting-note">
          Orbit 只发送当前操作所需的事项与项目名；AI 执行记录保留输入哈希、模型版本和结构化结果。
        </div>
      </section>
      <section className="settings-section">
        <h2>
          <Users size={20} />
          一起进入轨道
        </h2>
        <div className="member-list">
          {members.map((m) => (
            <div key={m.id}>
              <span className="avatar small">{m.user.name.slice(0, 1)}</span>
              <span>
                {m.user.name}
                <small>{m.user.email}</small>
              </span>
              <span className="role-badge">{m.role}</span>
            </div>
          ))}
        </div>
        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run('member', async () => {
                await api(`${prefix}/members`, 'POST', {
                  email: memberEmail,
                  role: memberRole,
                  ...(memberPassword ? { password: memberPassword } : {}),
                });
                setMemberEmail('');
                setMemberPassword('');
                await load();
                notify('成员已加入工作空间。');
              });
            }}
          >
            <label>
              成员邮箱
              <input
                required
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="同事的邮箱"
              />
            </label>
            <div className="form-grid">
              <label>
                角色
                <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                  <option value="member">成员 · 可编辑</option>
                  <option value="viewer">访客 · 只读</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
              <label>
                新账号初始密码
                <input
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  placeholder="已有账号可留空"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                />
              </label>
            </div>
            <button className="secondary-button" disabled={disabled}>
              添加成员
            </button>
          </form>
        )}
      </section>
      <section className="settings-section">
        <h2>
          <KeyRound size={20} />为 AI 打开一扇门
        </h2>
        <p>通过 Skill 与 HTTP API，让你的 AI 帮你记录。</p>
        <code className="api-path">/api/v1/workspaces/{wid}</code>
        {isAdmin && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run('token', async () => {
                  const response = await api<{ token: string }>(`${prefix}/tokens`, 'POST', {
                    name: tokenName,
                    scopes: tokenWrite
                      ? [
                          'items.read',
                          'items.write',
                          'projects.read',
                          'events.read',
                          'reports.read',
                          'reports.write',
                          'ai.run',
                        ]
                      : ['items.read', 'projects.read', 'events.read', 'reports.read'],
                    expiresDays: 90,
                  });
                  setNewToken(response.token);
                  setTokenName('');
                  await load();
                });
              }}
            >
              <label>
                令牌名称
                <input
                  required
                  placeholder="如：我的 Coding Agent"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                />
              </label>
              <label className="toggle-row">
                <span>
                  允许写入与 AI 执行<small>关闭时只授予读取权限</small>
                </span>
                <input
                  type="checkbox"
                  checked={tokenWrite}
                  onChange={(e) => setTokenWrite(e.target.checked)}
                />
              </label>
              <button className="secondary-button" disabled={disabled}>
                创建 90 天令牌
              </button>
            </form>
            {newToken && (
              <div className="token-reveal">
                <p>仅显示一次，请保存：</p>
                <code>{newToken}</code>
                <button
                  className="text-button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(newToken)
                      .then(() => notify('令牌已复制。'))
                      .catch(() => notify('请手动复制令牌。'))
                  }
                >
                  <Copy size={13} />
                  复制令牌
                </button>
              </div>
            )}
            <div className="token-list">
              {tokens
                .filter((t) => !t.revokedAt)
                .map((t) => (
                  <div key={t.id}>
                    <span>
                      {t.name}
                      <small>有效期至 {t.expiresAt.slice(0, 10)}</small>
                    </span>
                    <button
                      className="text-button"
                      disabled={disabled}
                      onClick={() =>
                        run('revoke', async () => {
                          await api(`${prefix}/tokens/${t.id}`, 'DELETE');
                          await load();
                          notify('令牌已撤销。');
                        })
                      }
                    >
                      撤销
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
        <a href="/orbit-skill.md" download className="text-button">
          <Download size={14} />
          下载 AI 接入说明
        </a>
      </section>
      <section className="settings-section">
        <h2>
          <OrbitIcon size={20} />
          空间与体验
        </h2>
        <label className="toggle-row">
          <span>
            轻量动效<small>保留反馈，减少位移与粒子</small>
          </span>
          <input type="checkbox" checked={reduced} onChange={(e) => onReduced(e.target.checked)} />
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run('workspace', async () => {
              await newWorkspace(spaceName);
              setSpaceName('');
              notify('新的工作空间已就绪。');
            });
          }}
        >
          <label>
            新工作空间
            <input
              required
              value={spaceName}
              onChange={(e) => setSpaceName(e.target.value)}
              placeholder="为另一个身份留出空间"
            />
          </label>
          <button className="secondary-button" disabled={disabled}>
            创建工作空间
          </button>
        </form>
      </section>
      <section className="settings-section">
        <h2>
          <Archive size={20} />
          记忆，永远属于你
        </h2>
        <p>完成和归档不会抹去记录。导出包含项目、事项、事件与周报。</p>
        {isAdmin && (
          <button
            className="secondary-button"
            disabled={disabled}
            onClick={() =>
              run('export', async () => {
                const data = await api(`${prefix}/export`);
                download(`orbit-${wid}.json`, JSON.stringify(data, null, 2), 'application/json');
                notify('工作空间已导出。');
              })
            }
          >
            <Download size={15} />
            导出完整工作空间
          </button>
        )}
        <div className="setting-note">
          离线时 Orbit 会保留离线提示；为避免数据冲突，记录和修改需要联网完成。
        </div>
      </section>
    </div>
  );
}
