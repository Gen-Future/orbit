'use client';

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  Bell,
  Orbit,
  PanelsTopLeft,
  SlidersHorizontal,
  Sparkles,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  boundPosition,
  clamp,
  deadlinePressure,
  orbitPosition,
  quadrantAt,
  stableSeed,
  pointToScreen,
  screenToPoint,
  type OrbitPoint,
  type PositionedItem,
} from '../../packages/core/src/orbit-position';
import { isInboxItem, isSedimentItem } from '../../packages/core/src';

import { layoutStarLabels } from '../../packages/core/src/orbit-labels';
import { SedimentBelt, type SedimentPage, type SedimentSummary } from './sediment-belt';
export type NebulaItem = PositionedItem & {
  title: string;
  triageStatus: 'pending' | 'triaged';
  version: number;
  projectId: string | null;
  project?: { name: string; color: string } | null;
};
type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  point: OrbitPoint;
  origin: OrbitPoint;
  labelOrigin: OrbitPoint;
  screen: OrbitPoint;
  moved: boolean;
  target: 'sun' | 'blackhole' | null;
};
export type StellarOutcome = { item: NebulaItem; kind: 'complete' | 'delete'; serial: number };
export type AISignal = {
  phase: 'listening' | 'resolved';
  quadrant?: number;
  title?: string;
  serial: number;
};
type Flight = {
  serial: number;
  kind: 'complete' | 'delete';
  title: string;
  from: OrbitPoint;
  to: OrbitPoint;
  quadrant: number;
};
const QUADRANTS = [
  { id: 3, title: '应变星区', action: '快速处理', detail: '不重要 · 紧急' },
  { id: 1, title: '行动星区', action: '现在行动', detail: '重要 · 紧急' },
  { id: 4, title: '留白星区', action: '留到以后', detail: '不重要 · 不紧急' },
  { id: 2, title: '生长星区', action: '安排推进', detail: '重要 · 不紧急' },
];
const STATUS_META: Record<string, { label: string; cosmic: string }> = {
  open: { label: '待开始', cosmic: '静候' },
  doing: { label: '进行中', cosmic: '运转' },
  blocked: { label: '已阻塞', cosmic: '受阻' },
  done: { label: '已完成', cosmic: '余辉' },
};

function NebulaBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const context = canvas.getContext('2d');
      if (!context) return;
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.scale(ratio, ratio);
      context.fillStyle = '#080c14';
      context.fillRect(0, 0, width, height);
      let seed = 9417;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      context.globalCompositeOperation = 'screen';
      for (let i = 0; i < 220; i++) {
        const t = random();
        const x = width * (0.03 + t * 0.94);
        const y = height * (0.7 - t * 0.4 + Math.sin(t * 8) * 0.17 + (random() - 0.5) * 0.3);
        const radius = (0.015 + random() * 0.13) * Math.min(width, height);
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const color = t > 0.6 ? '97,144,110' : t > 0.33 ? '65,109,156' : '107,69,168';
        gradient.addColorStop(0, `rgba(${color},${0.018 + random() * 0.025})`);
        gradient.addColorStop(0.4, `rgba(${color},0.012)`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      context.globalCompositeOperation = 'source-over';
      for (let i = 0; i < Math.min(540, (width * height) / 1800); i++) {
        const x = random() * width,
          y = random() * height,
          radius = random() > 0.95 ? 1.4 : 0.3 + random() * 0.65;
        context.fillStyle = `rgba(211,229,255,${0.15 + random() * 0.55})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        if (radius > 1.2) {
          context.strokeStyle = '#c9dfff22';
          context.lineWidth = 0.6;
          context.beginPath();
          context.moveTo(x - 5, y);
          context.lineTo(x + 5, y);
          context.moveTo(x, y - 5);
          context.lineTo(x, y + 5);
          context.stroke();
        }
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  return <canvas ref={canvasRef} className="nebula-background" aria-hidden="true" />;
}

function dueLabel(dueAt: string | null, now: number) {
  if (!dueAt) return '自由轨道';
  const hours = (Date.parse(dueAt) - now) / 36e5;
  if (hours <= 0) return '已逾期';
  if (hours < 1) return `${Math.ceil(hours * 60)} 分钟后截止`;
  if (hours < 24) return `${Math.ceil(hours)} 小时后截止`;
  return `${Math.ceil(hours / 24)} 天后截止`;
}

export function NebulaMatrix<T extends NebulaItem>({
  items,
  loading,
  now,
  writable,
  busy,
  captureBusy,
  zone,
  projects,
  immersive,
  onImmersive,
  onMove,
  onComplete,
  onDelete,
  outcome,
  aiSignal,
  reduced,
  onManage,
  menuRef,
  workspaceName,
  onNotifications,
  notificationCount,
  intent,
  onIntent,
  onCapture,
  onCancelCapture,
  onSelect,
  onAdd,
  onInbox,
  sediment,
  onLoadSediment,
  onBulkReschedule,
}: {
  items: T[];
  loading: boolean;
  now: Date | null;
  writable: boolean;
  busy: boolean;
  captureBusy: boolean;
  zone: string;
  projects: { id: string; name: string }[];
  immersive: boolean;
  onImmersive: () => void;
  onMove: (item: T, point: OrbitPoint) => Promise<boolean>;
  onComplete: (item: T) => Promise<boolean>;
  onDelete: (item: T) => Promise<boolean>;
  outcome: StellarOutcome | null;
  aiSignal: AISignal | null;
  reduced: boolean;
  onManage: () => void;
  menuRef: RefObject<HTMLButtonElement | null>;
  workspaceName: string;
  onNotifications: () => void;
  notificationCount: number;
  intent: string;
  onIntent: (value: string) => void;
  onCapture: () => Promise<void>;
  onCancelCapture: () => void;
  onSelect: (item: T) => void;
  onAdd: (quadrant: number) => void;
  onInbox: () => void;
  sediment: SedimentSummary;
  onLoadSediment: (input: {
    page: number;
    quadrant: number;
    query: string;
  }) => Promise<SedimentPage<T>>;
  onBulkReschedule: (items: { id: string; version: number }[], dueAt: string) => Promise<boolean>;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const blackholeRef = useRef<HTMLDivElement>(null);
  const launchRef = useRef<{ id: string; from: OrbitPoint; to: OrbitPoint } | null>(null);
  const outcomeRef = useRef<number | null>(outcome?.serial || null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const savingRef = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<{ id: string; point: OrbitPoint } | null>(null);
  const [resolving, setResolving] = useState<{ id: string; kind: 'complete' | 'delete' } | null>(
    null,
  );
  const [flight, setFlight] = useState<Flight | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [landed, setLanded] = useState('');
  const [help, setHelp] = useState(false);
  const [sunMenuOpen, setSunMenuOpen] = useState(false);
  const [frame, setFrame] = useState({ width: 1000, height: 700, nodeWidth: 174 });
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const update = () =>
      setFrame({
        width: field.clientWidth,
        height: field.clientHeight,
        nodeWidth: window.innerWidth <= 700 ? 84 : window.innerWidth <= 1100 ? 148 : 174,
      });
    const observer = new ResizeObserver(update);
    observer.observe(field);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  const time = now?.getTime() || 0;
  const candidates = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.triageStatus === 'triaged' &&
            !isSedimentItem(item, Date.parse(sediment.serverNow)) &&
            (status === 'all' ||
              (status === 'active' ? item.status !== 'done' : item.status === status)) &&
            (!query ||
              `${item.title} ${item.project?.name || ''}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (!project || item.projectId === project),
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    [items, query, project, status, sediment.serverNow],
  );
  const pages = useMemo(
    () =>
      layoutStarLabels(
        candidates.map((item) => ({
          id: item.id,
          quadrant: item.quadrant,
          anchor: pointToScreen(orbitPosition(item, time), frame),
        })),
        frame.width,
        frame.height,
        frame.nodeWidth < 100,
        sediment.total ? (frame.nodeWidth < 100 ? 48 : 88) : 0,
      ),
    [candidates, time, frame, sediment.total],
  );
  const pageCount = pages.length;
  const currentPage = Math.min(page, pageCount - 1);
  const labels = pages[currentPage];
  const positions = new Map(labels.map((entry) => [entry.id, entry]));
  const visible = candidates.filter((item) => positions.has(item.id));
  const inboxCount = items.filter(isInboxItem).length;
  const firstUse = !loading && items.length === 0 && sediment.total === 0;
  const filteredEmpty = Boolean(query || project || status !== 'active');
  useEffect(() => {
    setPage(0);
  }, [query, project, status]);
  useEffect(() => {
    if (!landed) return;
    const timer = setTimeout(() => setLanded(''), 900);
    return () => clearTimeout(timer);
  }, [landed]);
  function cancelDrag() {
    if (!dragRef.current) return;
    if (dragRef.current?.moved) suppressClick.current = true;
    dragRef.current = null;
    setDrag(null);
    setMessage('已取消移动');
  }
  useEffect(() => {
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && dragRef.current) {
        event.stopPropagation();
        cancelDrag();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  async function commit(item: T, point: OrbitPoint) {
    if (savingRef.current || busy || !writable) return;
    savingRef.current = true;
    const bounded = boundPosition(point);
    setPending({ id: item.id, point: bounded });
    setMessage('正在保存星体坐标…');
    try {
      const saved = await onMove(item, bounded);
      if (saved) {
        setLanded(item.id);
        setMessage(
          `「${item.title}」已进入${QUADRANTS.find((q) => q.id === quadrantAt(bounded))?.title}，位置已保存。`,
        );
      } else setMessage('位置未保存，已回到原轨道。请重试。');
    } catch {
      setMessage('位置未保存，已回到原轨道。请重试。');
    } finally {
      savingRef.current = false;
      setPending(null);
    }
  }
  function targetAt(clientX: number, clientY: number): Drag['target'] {
    for (const [name, element] of [
      ['blackhole', blackholeRef.current],
      ['sun', sunRef.current],
    ] as const) {
      const rect = element?.getBoundingClientRect();
      if (
        rect &&
        Math.hypot(
          (clientX - rect.left - rect.width / 2) / (rect.width / 2),
          (clientY - rect.top - rect.height / 2) / (rect.height / 2),
        ) <= 1
      )
        return name;
    }
    return null;
  }
  async function resolveItem(item: T, kind: 'complete' | 'delete', current: Drag) {
    if (savingRef.current || busy || !writable || (kind === 'complete' && item.status === 'done'))
      return;
    const shell = shellRef.current!.getBoundingClientRect();
    const field = fieldRef.current!.getBoundingClientRect();
    const target = (kind === 'complete' ? sunRef : blackholeRef).current!.getBoundingClientRect();
    launchRef.current = {
      id: item.id,
      from: {
        x: field.left - shell.left + current.screen.x,
        y: field.top - shell.top + current.screen.y,
      },
      to: {
        x: target.left - shell.left + target.width / 2,
        y: target.top - shell.top + target.height / 2,
      },
    };
    savingRef.current = true;
    setResolving({ id: item.id, kind });
    setMessage(kind === 'complete' ? '正在保存完成状态…' : '正在删除事项…');
    try {
      const saved = await (kind === 'complete' ? onComplete(item) : onDelete(item));
      setMessage(
        saved
          ? kind === 'complete'
            ? `「${item.title}」已完成，光芒留在太阳里。`
            : `「${item.title}」已删除，可以撤销。`
          : '操作未保存，事项留在原轨道。请重试。',
      );
      if (!saved) launchRef.current = null;
      if (saved && document.activeElement === document.body)
        viewRef.current?.focus({ preventScroll: true });
    } catch {
      launchRef.current = null;
      setMessage('操作未保存，事项留在原轨道。请重试。');
    } finally {
      savingRef.current = false;
      setResolving(null);
    }
  }
  useEffect(() => {
    if (!outcome || outcomeRef.current === outcome.serial) return;
    outcomeRef.current = outcome.serial;
    const shell = shellRef.current?.getBoundingClientRect();
    const field = fieldRef.current?.getBoundingClientRect();
    if (!shell || !field) return;
    const anchor = pointToScreen(orbitPosition(outcome.item, time), frame);
    const launch = launchRef.current?.id === outcome.item.id ? launchRef.current : null;
    const sun = sunRef.current!.getBoundingClientRect();
    setFlight({
      serial: outcome.serial,
      kind: outcome.kind,
      title: outcome.item.title,
      quadrant: outcome.item.quadrant || 2,
      from: launch?.from || {
        x: clamp(field.left - shell.left + anchor.x, 24, shell.width - 24),
        y: clamp(field.top - shell.top + anchor.y, 24, shell.height - 24),
      },
      to:
        launch?.to ||
        (outcome.kind === 'complete'
          ? { x: sun.left - shell.left + sun.width / 2, y: sun.top - shell.top + sun.height / 2 }
          : { x: shell.width / 2, y: shell.height - 70 }),
    });
    launchRef.current = null;
  }, [outcome, frame, time]);
  useEffect(() => {
    if (!flight) return;
    const timer = setTimeout(() => setFlight(null), reduced ? 500 : 1100);
    return () => clearTimeout(timer);
  }, [flight, reduced]);
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, item: T, point: OrbitPoint) {
    suppressClick.current = false;
    if (!writable || busy || savingRef.current || event.button !== 0 || dragRef.current) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = {
      id: item.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      point,
      origin: pointToScreen(point, frame),
      labelOrigin: positions.get(item.id)?.label || pointToScreen(point, frame),
      screen: pointToScreen(point, frame),
      moved: false,
      target: null,
    };
    dragRef.current = next;
    setDrag(next);
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - current.startX,
      dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    const screen = {
      x: clamp(current.origin.x + dx, frame.nodeWidth / 2, rect.width - frame.nodeWidth / 2),
      y: clamp(current.origin.y + dy, 45, rect.height - 45),
    };
    let target = targetAt(event.clientX, event.clientY);
    if (target === 'sun' && items.find((item) => item.id === current.id)?.status === 'done')
      target = null;
    if (target !== current.target)
      setMessage(
        target === 'sun'
          ? '松手完成，星体将汇入太阳。'
          : target === 'blackhole'
            ? '松手删除事项，可撤销。'
            : '已离开目标，松手保存位置。',
      );
    else if (!current.moved) setMessage('拖入太阳完成，拖入黑洞删除，Escape 取消。');
    const next = { ...current, moved: true, target, screen, point: screenToPoint(screen, frame) };
    dragRef.current = next;
    setDrag(next);
    suppressClick.current = true;
  }
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, item: T) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved) {
      if (current.target)
        void resolveItem(item, current.target === 'sun' ? 'complete' : 'delete', current);
      else void commit(item, current.point);
    }
  }
  function keyboardMove(event: KeyboardEvent<HTMLButtonElement>, item: T, point: OrbitPoint) {
    if (
      !event.altKey ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) ||
      !writable ||
      busy ||
      pending
    )
      return;
    event.preventDefault();
    suppressClick.current = false;
    const step = 0.15;
    void commit(item, {
      x: point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      y: point.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
    });
  }
  function changeZoom(next: number) {
    const view = viewRef.current;
    const fractionX = view ? (view.scrollLeft + view.clientWidth / 2) / view.scrollWidth : 0.5;
    const fractionY = view ? (view.scrollTop + view.clientHeight / 2) / view.scrollHeight : 0.5;
    setZoom(clamp(next, 1, 2));
    requestAnimationFrame(() => {
      if (view) {
        view.scrollLeft = fractionX * view.scrollWidth - view.clientWidth / 2;
        view.scrollTop = fractionY * view.scrollHeight - view.clientHeight / 2;
      }
    });
  }
  return (
    <section className="nebula-matrix" aria-label="四象限星云图">
      <header className="nebula-header">
        <button
          ref={menuRef}
          className="nebula-cockpit"
          onClick={onManage}
          aria-label="打开工作舱"
          aria-controls="main-navigation"
          title="打开工作舱"
        >
          <Orbit size={27} />
          <span>
            orbit<span className="brand-period">.</span>
          </span>
          <PanelsTopLeft size={17} />
          <span className="nebula-cockpit-label">工作舱</span>
        </button>
        <div className="nebula-heading">
          <h1>{workspaceName}</h1>
        </div>
        <div className="nebula-header-actions">
          <button
            className="nebula-quiet-button"
            aria-label="星图筛选"
            title="筛选星体"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={18} />
            <span>筛选</span>
          </button>
          <button
            className="nebula-quiet-button"
            aria-label="通知"
            title="通知"
            onClick={onNotifications}
          >
            <Bell size={18} />
            {notificationCount > 0 && <span className="nebula-notification-dot" />}
          </button>
          <button
            className="nebula-quiet-button"
            onClick={onImmersive}
            aria-label={immersive ? '退出沉浸模式' : '进入沉浸模式'}
            title={immersive ? '退出沉浸模式' : '进入沉浸模式'}
          >
            {immersive ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{immersive ? '退出沉浸' : '沉浸模式'}</span>
          </button>
          {writable && (
            <button
              className="primary-button nebula-add-button"
              aria-label="放入星图"
              title="放入星图"
              onClick={() => onAdd(2)}
            >
              <Plus size={16} />
              <span>放入星图</span>
            </button>
          )}
        </div>
      </header>
      <div className="nebula-filters" hidden={!filtersOpen}>
        <label className="nebula-search">
          <Search size={15} />
          <span className="sr-only">搜索星图事项</span>
          <input
            placeholder="寻找你的星体…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="清空星图搜索" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <select
          aria-label="星图项目"
          value={project}
          onChange={(event) => setProject(event.target.value)}
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="星图状态"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">全部未完成</option>
          <option value="open">待开始</option>
          <option value="doing">进行中</option>
          <option value="blocked">已阻塞</option>
          <option value="done">已完成</option>
          <option value="all">全部状态</option>
        </select>
        <button className="nebula-inbox" onClick={onInbox}>
          待整理 <span>{inboxCount}</span>
          <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="nebula-map-shell" ref={shellRef}>
        <div
          className="nebula-viewport"
          ref={viewRef}
          tabIndex={0}
          aria-label="星图画布，放大后可滚动探索"
        >
          <div
            className={`nebula-field ${drag?.moved ? 'is-dragging' : ''}`}
            ref={fieldRef}
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          >
            <NebulaBackground />
            <div className="nebula-coordinate-grid" aria-hidden="true" />
            <div className="nebula-orbit-ring ring-outer" aria-hidden="true" />
            <div className="nebula-orbit-ring ring-inner" aria-hidden="true" />
            {aiSignal && (
              <div
                key={aiSignal.serial}
                className={`nebula-ai-signal is-${aiSignal.phase} ${aiSignal.quadrant ? `nebula-ai-q${aiSignal.quadrant}` : ''}`}
                role="status"
                aria-live="polite"
              >
                <div className="ai-signal-radar" aria-hidden="true">
                  <span className="ai-signal-orbit orbit-one" />
                  <span className="ai-signal-orbit orbit-two" />
                  <span className="ai-signal-beam" />
                  <span className="ai-signal-core">
                    <Sparkles size={18} />
                  </span>
                  <i className="signal-node node-one" />
                  <i className="signal-node node-two" />
                  <i className="signal-node node-three" />
                </div>
                <div className="ai-signal-copy">
                  <strong>
                    {aiSignal.phase === 'resolved' ? '已找到最佳轨道' : '正在解析你的意图'}
                  </strong>
                  <span>
                    {aiSignal.phase === 'resolved'
                      ? `${QUADRANTS.find((entry) => entry.id === aiSignal.quadrant)?.title || '待整理'} · ${aiSignal.title || '准备确认'}`
                      : '读取时间、行动与优先级'}
                  </span>
                </div>
              </div>
            )}
            <div className="nebula-axis-x" aria-hidden="true">
              <span className="nebula-axis-label axis-low">
                <strong>不重要</strong>
              </span>
              <span className="nebula-axis-label axis-high">
                <strong>重要</strong>
                <ArrowUpRight size={14} />
              </span>
            </div>
            <div className="nebula-axis-y" aria-hidden="true">
              <span className="nebula-axis-label axis-high">
                <strong>紧急</strong>
                <ArrowUp size={14} />
              </span>
              <span className="nebula-axis-label axis-low">
                <strong>不紧急</strong>
              </span>
            </div>
            <div
              ref={sunRef}
              className={`nebula-sun ${sunMenuOpen ? 'is-menu-open' : ''} ${drag?.moved ? 'is-armed' : ''} ${drag?.target === 'sun' ? 'is-target' : ''} ${flight?.kind === 'complete' ? 'is-fed' : ''}`}
              role="group"
              aria-label="太阳，拖入事项完成"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSunMenuOpen(false);
              }}
            >
              <span className="sun-corona" />
              <span className="sun-core" />
              <span className="sun-flare" />
              {writable && (
                <>
                  <button
                    type="button"
                    className="sun-menu-trigger"
                    aria-label="选择添加事项的星区"
                    aria-expanded={sunMenuOpen}
                    onClick={() => setSunMenuOpen((open) => !open)}
                  />
                  <div className="sun-quick-menu" role="group" aria-label="快捷添加事项">
                    {QUADRANTS.map((quadrant) => (
                      <button
                        type="button"
                        key={quadrant.id}
                        className={`sun-quick-add sun-quick-add-q${quadrant.id} nebula-color-${quadrant.id}`}
                        aria-label={`在${quadrant.title}添加事项`}
                        title={`${quadrant.title} · ${quadrant.action}`}
                        onClick={() => {
                          setSunMenuOpen(false);
                          onAdd(quadrant.id);
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {(drag?.moved || resolving?.kind === 'complete' || flight?.kind === 'complete') && (
                <span className="celestial-label" role="status" aria-live="polite">
                  {resolving?.kind === 'complete'
                    ? '正在完成…'
                    : flight?.kind === 'complete'
                      ? '已汇入太阳'
                      : drag?.target === 'sun'
                        ? '松手完成'
                        : '拖到太阳完成'}
                </span>
              )}
            </div>
            {QUADRANTS.map((q) => (
              <div
                key={q.id}
                className={`nebula-quadrant nebula-q${q.id} ${drag?.moved && !drag.target && quadrantAt(drag.point) === q.id ? 'is-target' : ''}`}
              >
                <div className="nebula-quadrant-heading">
                  <span className="nebula-q-code">Q{q.id}</span>
                  <h2>{q.title}</h2>
                  <span className="nebula-q-count">
                    {candidates.filter((item) => item.quadrant === q.id).length}
                  </span>
                </div>
                <p>{q.action}</p>
              </div>
            ))}
            <svg
              className="nebula-leaders"
              width={frame.width}
              height={frame.height}
              aria-hidden="true"
            >
              {visible.map((item) => {
                const entry = positions.get(item.id)!;
                const anchor =
                  drag?.id === item.id && drag.moved
                    ? drag.screen
                    : pending?.id === item.id
                      ? pointToScreen(pending.point, frame)
                      : entry.anchor;
                const label =
                  drag?.id === item.id && drag.moved
                    ? {
                        x: drag.labelOrigin.x + drag.screen.x - drag.origin.x,
                        y: drag.labelOrigin.y + drag.screen.y - drag.origin.y,
                      }
                    : entry.label;
                return (
                  <line
                    key={item.id}
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={label.x}
                    y2={label.y}
                    className={`nebula-color-${item.quadrant}`}
                  />
                );
              })}
            </svg>
            {visible.map((item) => {
              const base = orbitPosition(item, time);
              const entry = positions.get(item.id)!;
              const point =
                drag?.id === item.id ? drag.point : pending?.id === item.id ? pending.point : base;
              const anchor =
                drag?.id === item.id && drag.moved
                  ? drag.screen
                  : pending?.id === item.id
                    ? pointToScreen(point, frame)
                    : entry.anchor;
              const label =
                drag?.id === item.id && drag.moved
                  ? {
                      x: drag.labelOrigin.x + drag.screen.x - drag.origin.x,
                      y: drag.labelOrigin.y + drag.screen.y - drag.origin.y,
                    }
                  : entry.label;
              const q =
                drag?.id === item.id || pending?.id === item.id ? quadrantAt(point) : item.quadrant;
              const pressure = deadlinePressure(item.dueAt, time);
              const statusMeta = STATUS_META[item.status] || STATUS_META.open;
              const deadline = item.dueAt
                ? new Intl.DateTimeFormat('zh-CN', {
                    timeZone: zone,
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23',
                  }).format(new Date(item.dueAt))
                : '未设截止时间';
              const events = {
                onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) =>
                  startDrag(event, item, base),
                onPointerMove: moveDrag,
                onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => endDrag(event, item),
                onPointerCancel: cancelDrag,
                onLostPointerCapture: () => {
                  if (dragRef.current) cancelDrag();
                },
                onClick: () => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onSelect(item);
                },
              };
              const classes = `nebula-color-${q} is-status-${item.status} ${drag?.id === item.id && drag.moved ? 'is-dragging' : ''} ${pressure > 0.9 ? 'is-hot' : ''} ${item.status === 'done' ? 'is-done' : ''} ${landed === item.id ? 'just-landed' : ''}`;
              return (
                <Fragment key={item.id}>
                  <button
                    className={`nebula-anchor ${classes}`}
                    data-anchor-id={item.id}
                    data-status={item.status}
                    tabIndex={-1}
                    aria-label={`星体：${item.title}，${statusMeta.label}`}
                    style={
                      {
                        left: anchor.x,
                        top: anchor.y,
                        '--star-delay': `${-(stableSeed(item.id) % 100) / 10}s`,
                        '--star-size': `${18 + pressure * 10}px`,
                      } as CSSProperties
                    }
                    {...events}
                  >
                    <span className="nebula-star">
                      <span className="nebula-star-energy" />
                      <span className="nebula-star-halo" />
                      <span className="nebula-star-orbit">
                        <span className="nebula-star-satellite" />
                      </span>
                      <span className="nebula-star-core" />
                      <span className="nebula-star-shadow" />
                      <span className="nebula-star-fracture" />
                      {item.status === 'done' && (
                        <Check className="nebula-done-mark" size={13} aria-hidden="true" />
                      )}
                    </span>
                  </button>
                  <button
                    className={`nebula-item ${classes}`}
                    data-item-id={item.id}
                    data-quadrant={q}
                    data-status={item.status}
                    data-readonly={!writable ? 'true' : undefined}
                    style={{ left: label.x, top: label.y }}
                    aria-label={`${item.title}，${statusMeta.label}，${QUADRANTS.find((v) => v.id === q)?.detail}，${deadline}`}
                    aria-describedby="nebula-instructions"
                    title={`${item.title}\n${deadline}`}
                    {...events}
                    onKeyDown={(event) => keyboardMove(event, item, base)}
                  >
                    <span className="nebula-item-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {item.status === 'done'
                          ? '余辉 · 已完成'
                          : `${statusMeta.cosmic} · ${dueLabel(item.dueAt, time)}`}
                      </small>
                    </span>
                  </button>
                </Fragment>
              );
            })}
            {!loading && !visible.length && (
              <div
                className={`nebula-empty ${firstUse ? 'is-first' : ''}`}
                role={firstUse ? 'region' : 'status'}
                aria-label={firstUse ? '添加第一件事项' : undefined}
              >
                {firstUse ? <Sparkles size={34} /> : <Crosshair size={28} />}
                <h3>
                  {firstUse
                    ? '先添加一件事项'
                    : filteredEmpty
                      ? '没有符合当前条件的事项'
                      : inboxCount > 0
                        ? '有事项正在收件箱等待整理'
                        : sediment.total
                          ? '长期逾期事项已进入时间沉积带'
                          : '当前没有待推进的事项'}
                </h3>
                <p>
                  {firstUse
                    ? '输入一句话让 AI 帮你整理，或点击下方按钮手动添加。'
                    : filteredEmpty
                      ? '调整搜索、项目或状态筛选后再看看。'
                      : inboxCount > 0
                        ? '先为它们决定优先级，再放入四象限。'
                        : sediment.total
                          ? '打开右侧沉积带，为它们重新安排时间。'
                          : '新的事项会出现在这片星图中。'}
                </p>
                {writable && firstUse && (
                  <button
                    className="primary-button"
                    aria-label="添加第一件事项"
                    onClick={() => onAdd(2)}
                  >
                    添加第一件事项 <Plus size={16} />
                  </button>
                )}
                {!firstUse && inboxCount > 0 && !filteredEmpty && (
                  <button className="secondary-button" onClick={onInbox}>
                    去整理收件箱 <ArrowUpRight size={15} />
                  </button>
                )}
                {!firstUse && sediment.total > 0 && !filteredEmpty && inboxCount === 0 && (
                  <span className="nebula-empty-hint">从右侧的时间沉积带进入</span>
                )}
              </div>
            )}
          </div>
        </div>
        <SedimentBelt
          summary={sediment}
          zone={zone}
          writable={writable}
          busy={busy}
          load={onLoadSediment}
          onComplete={onComplete}
          onOpen={onSelect}
          onBulkReschedule={onBulkReschedule}
        />
        {((drag?.moved && writable && !busy) ||
          resolving?.kind === 'delete' ||
          flight?.kind === 'delete') && (
          <div
            className={`nebula-blackhole ${drag?.target === 'blackhole' ? 'is-target' : ''} ${flight?.kind === 'delete' ? 'is-fed' : ''}`}
          >
            <div
              ref={blackholeRef}
              className="blackhole-target"
              role="img"
              aria-label="黑洞，拖入删除事项"
            >
              <span className="blackhole-disk" />
              <span className="blackhole-core" />
              <span className="blackhole-lens" />
            </div>
            <span className="blackhole-label">
              {resolving?.kind === 'delete'
                ? '正在删除…'
                : drag?.target === 'blackhole'
                  ? '松手删除 · 可撤销'
                  : '拖入黑洞删除'}
            </span>
          </div>
        )}
        {flight && (
          <div
            key={flight.serial}
            className={`stellar-flight flight-${flight.kind} nebula-color-${flight.quadrant}`}
            data-outcome={flight.kind}
            aria-hidden="true"
            style={
              {
                left: flight.from.x,
                top: flight.from.y,
                '--flight-x': `${flight.to.x - flight.from.x}px`,
                '--flight-y': `${flight.to.y - flight.from.y}px`,
                '--bend-x': `${(flight.to.x - flight.from.x) * 0.65 + 65}px`,
                '--bend-y': `${(flight.to.y - flight.from.y) * 0.45 - 55}px`,
              } as CSSProperties
            }
          >
            <span className="flight-star" />
            <span className="flight-trail" />
            <span className="flight-title">{flight.title}</span>
          </div>
        )}
      </div>
      {writable && (
        <form
          className="nebula-intent"
          onSubmit={(event) => {
            event.preventDefault();
            if (captureBusy) onCancelCapture();
            else if (!busy && intent.trim()) void onCapture();
          }}
        >
          <Sparkles size={18} aria-hidden="true" />
          <input
            aria-label="自然语言记录事项"
            placeholder="下一件事是什么？试试：明天下午 3 点交方案"
            value={intent}
            onChange={(event) => onIntent(event.target.value)}
            maxLength={12000}
            disabled={busy}
          />
          <button
            type="submit"
            aria-label={captureBusy ? '取消 AI 整理' : '解析并放入轨道'}
            disabled={(busy && !captureBusy) || (!captureBusy && !intent.trim())}
          >
            {captureBusy ? <X size={20} /> : <ArrowUp size={20} />}
          </button>
        </form>
      )}
      <div className="nebula-map-controls">
        <button aria-label="缩小星图" disabled={zoom === 1} onClick={() => changeZoom(zoom - 0.25)}>
          <Minus size={16} />
        </button>
        <button aria-label="重置星图缩放" onClick={() => changeZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button aria-label="放大星图" disabled={zoom === 2} onClick={() => changeZoom(zoom + 0.25)}>
          <Plus size={16} />
        </button>
      </div>
      <footer className="nebula-footer">
        <button
          className="nebula-help-toggle"
          title="查看星图操作"
          onClick={() => setHelp(!help)}
          aria-expanded={help}
        >
          <Move size={14} />
          <span>{writable ? '操作' : '查看操作'}</span>
        </button>
        <div className="nebula-pagination">
          <span>
            {candidates.length ? `${visible.length}` : '0'} / {candidates.length} 颗星
            {sediment.total ? ` · ${sediment.total} 件沉积` : ''}
          </span>
          {pageCount > 1 && (
            <>
              <button
                aria-label="上一组星体"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="下一组星体"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </footer>
      {help && (
        <div className="nebula-help">
          <div className="nebula-status-legend" aria-label="星体状态图例">
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <div key={value} className={`status-legend-item is-status-${value}`}>
                <span className="status-legend-star" aria-hidden="true">
                  {value === 'done' && <Check size={9} />}
                </span>
                <span>
                  <strong>{meta.cosmic}</strong>
                  <small>{meta.label}</small>
                </span>
              </div>
            ))}
          </div>
          <p>
            横轴向右越重要，纵轴向上越紧急。自动漂移在截止前 14
            天开始，始终留在当前象限；手动拖动可跨象限，并保存新坐标。缩放后可滚动探索。
          </p>
          <p>
            拖入中心太阳完成事项；拖动时出现黑洞，拖入黑洞删除事项，支持撤销。离开太阳或黑洞后松手仍只保存位置。
          </p>
          <p>
            点击星体查看详情，也可在详情中完成；键盘聚焦后按 Alt + 方向键移动，拖动时按 Escape
            取消。
          </p>
        </div>
      )}
      <span className="sr-only" id="nebula-instructions">
        点击查看详情并完成事项。可拖动改变位置和象限，或使用 Alt
        加方向键移动。拖入太阳完成事项；拖入拖动时出现的黑洞删除事项，可撤销。按 Escape 取消拖动。
      </span>
      <span className="sr-only" role="status">
        {message}
      </span>
    </section>
  );
}
