'use client';

import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { localParts, quadrantNames, zonedInstant } from '../../packages/core/src';

export type SedimentItem = {
  id: string;
  title: string;
  status: string;
  version: number;
  quadrant: number;
  dueAt: string | null;
  project?: { name: string; color: string } | null;
};
export type SedimentGroup = { count: number; earliestDueAt: string | null };
export type SedimentSummary = {
  total: number;
  byQuadrant: Record<number, SedimentGroup>;
  earliestDueAt: string | null;
  thresholdAt: string;
  serverNow: string;
};
export type SedimentPage<T extends SedimentItem> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  summary: SedimentSummary;
};

const groups = [
  { id: 3, title: '应变星区' },
  { id: 1, title: '行动星区' },
  { id: 4, title: '留白星区' },
  { id: 2, title: '生长星区' },
];
const statusLabel: Record<string, string> = {
  open: '待开始',
  doing: '进行中',
  blocked: '已阻塞',
};

function localInput(date: Date, zone: string) {
  const part = localParts(date, zone);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

function overdueDays(dueAt: string | null, now: string) {
  return dueAt ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(dueAt)) / 864e5)) : 0;
}

export function SedimentBelt<T extends SedimentItem>({
  summary,
  zone,
  writable,
  busy,
  load,
  onComplete,
  onOpen,
  onBulkReschedule,
}: {
  summary: SedimentSummary;
  zone: string;
  writable: boolean;
  busy: boolean;
  load: (input: { page: number; quadrant: number; query: string }) => Promise<SedimentPage<T>>;
  onComplete: (item: T) => Promise<boolean>;
  onOpen: (item: T) => void;
  onBulkReschedule: (items: { id: string; version: number }[], dueAt: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [quadrant, setQuadrant] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SedimentPage<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, T>>(new Map());
  const [dueAt, setDueAt] = useState('');
  const [message, setMessage] = useState('');
  const [receiving, setReceiving] = useState<Set<number>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousCounts = useRef<Record<number, number>>(
    Object.fromEntries(groups.map(({ id }) => [id, summary.byQuadrant[id]?.count || 0])),
  );

  useEffect(() => {
    const next = new Set(
      groups
        .filter(
          ({ id }) => (summary.byQuadrant[id]?.count || 0) > (previousCounts.current[id] || 0),
        )
        .map(({ id }) => id),
    );
    previousCounts.current = Object.fromEntries(
      groups.map(({ id }) => [id, summary.byQuadrant[id]?.count || 0]),
    );
    if (next.size) {
      setReceiving(next);
      const timer = setTimeout(() => setReceiving(new Set()), 800);
      return () => clearTimeout(timer);
    }
    setReceiving(new Set());
  }, [summary.byQuadrant]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setMessage('');
    let active = true;
    const timer = setTimeout(
      () => {
        load({ page, quadrant, query })
          .then((value) => {
            if (active) setResult(value);
          })
          .catch((error: Error) => {
            if (active) setMessage(error.message);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      },
      query ? 220 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, page, quadrant, query, load]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),a[href]',
        ) || [],
      );
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0]?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
      else triggerRef.current?.focus();
    };
  }, [open]);

  const pageItems = result?.items || [];
  const selectedItems = [...selected.values()];
  const minDueAt = useMemo(() => localInput(new Date(Date.now() + 60000), zone), [zone]);

  if (!summary.total && !open) return null;

  function openGroup(value: number) {
    setQuadrant(value);
    setPage(1);
    setResult(null);
    setLoading(true);
    setOpen(true);
  }

  function toggle(item: T) {
    setMessage('');
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < 100) next.set(item.id, item);
      else setMessage('一次最多选择 100 件事项。');
      return next;
    });
  }

  async function reload() {
    const value = await load({ page, quadrant, query });
    setResult(value);
    if (page > 1 && !value.items.length) setPage(page - 1);
  }

  return (
    <>
      {Boolean(summary.total) && (
        <aside
          className={`sediment-belt ${receiving.size ? 'is-receiving' : ''}`}
          aria-label="时间沉积带，逾期 7 天以上"
        >
          <button
            ref={triggerRef}
            className="sediment-mobile-trigger"
            onClick={() => openGroup(0)}
            aria-label={`打开时间沉积带，共 ${summary.total} 件事项`}
          >
            <Clock3 size={17} />
            <strong>{summary.total > 99 ? '99+' : summary.total}</strong>
          </button>
          <span className="sediment-belt-title">时间沉积带</span>
          <div className="sediment-clusters">
            {groups.map((group) => {
              const value = summary.byQuadrant[group.id] || { count: 0, earliestDueAt: null };
              if (!value.count) return <span key={group.id} className="sediment-cluster-empty" />;
              const days = overdueDays(value.earliestDueAt, summary.serverNow);
              return (
                <button
                  key={group.id}
                  className={`sediment-cluster nebula-color-${group.id} ${receiving.has(group.id) ? 'is-receiving' : ''}`}
                  onClick={() => openGroup(group.id)}
                  aria-label={`${group.title}，${value.count} 件，最久逾期 ${days} 天`}
                  title={`${group.title} · ${value.count} 件 · 最久逾期 ${days} 天`}
                >
                  <span className="sediment-cluster-core" />
                  <strong>{value.count > 99 ? '99+' : value.count}</strong>
                </button>
              );
            })}
          </div>
          <button className="sediment-open-all" onClick={() => openGroup(0)}>
            <span>{summary.total}</span>
            <small>逾期 7 天以上</small>
          </button>
        </aside>
      )}

      {open && (
        <div
          className="sediment-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="sediment-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sediment-title"
            ref={dialogRef}
          >
            <header>
              <div>
                <h2 id="sediment-title">时间沉积带</h2>
                <p>逾期 7 天以上 · 从最久未处理开始</p>
              </div>
              <button
                className="icon-button"
                aria-label="关闭时间沉积带"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </header>

            <div className="sediment-tools">
              <label className="sediment-search">
                <Search size={15} />
                <span className="sr-only">搜索沉积事项</span>
                <input
                  value={query}
                  placeholder="搜索事项或项目"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                    setLoading(true);
                  }}
                />
                {query && (
                  <button
                    aria-label="清空沉积事项搜索"
                    onClick={() => {
                      setLoading(true);
                      setQuery('');
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              <div className="sediment-segments" aria-label="按象限筛选">
                {[{ id: 0, title: '全部' }, ...groups].map((group) => (
                  <button
                    key={group.id}
                    className={quadrant === group.id ? 'active' : ''}
                    aria-pressed={quadrant === group.id}
                    onClick={() => {
                      setQuadrant(group.id);
                      setPage(1);
                      setLoading(true);
                    }}
                  >
                    {group.title.replace('星区', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="sediment-selection">
              <label>
                <input
                  type="checkbox"
                  checked={
                    Boolean(pageItems.length) && pageItems.every((item) => selected.has(item.id))
                  }
                  onChange={(event) => {
                    if (!event.target.checked) {
                      setSelected((current) => {
                        const next = new Map(current);
                        pageItems.forEach((item) => next.delete(item.id));
                        return next;
                      });
                      return;
                    }
                    setSelected((current) => {
                      const next = new Map(current);
                      for (const item of pageItems) {
                        if (next.size >= 100) break;
                        next.set(item.id, item);
                      }
                      if (next.size === 100 && pageItems.some((item) => !next.has(item.id)))
                        setMessage('已达到单次 100 件的上限。');
                      return next;
                    });
                  }}
                />
                选择本页
              </label>
              <span>
                {selected.size
                  ? `已选 ${selected.size} 件`
                  : `${result?.total ?? summary.total} 件`}
              </span>
              {selected.size > 0 && (
                <button className="text-button" onClick={() => setSelected(new Map())}>
                  清空选择
                </button>
              )}
            </div>

            <div className="sediment-list" aria-busy={loading}>
              {pageItems.map((item) => (
                <article className="sediment-row" key={item.id}>
                  <label className="sediment-check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item)}
                      aria-label={`选择 ${item.title}`}
                    />
                  </label>
                  <button
                    className="sediment-row-main"
                    onClick={() => {
                      setOpen(false);
                      onOpen(item);
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>
                      <i className={`q-dot q${item.quadrant}`} />
                      {quadrantNames[item.quadrant]} · {statusLabel[item.status] || item.status}
                      {item.project?.name ? ` · ${item.project.name}` : ''}
                    </span>
                  </button>
                  <div className="sediment-age">
                    <strong>
                      {overdueDays(item.dueAt, result?.summary.serverNow || summary.serverNow)}
                    </strong>
                    <span>天</span>
                  </div>
                  <button
                    className="sediment-complete"
                    disabled={!writable || busy}
                    aria-label={`完成 ${item.title}`}
                    title="完成事项"
                    onClick={async () => {
                      if (await onComplete(item)) {
                        setSelected((current) => {
                          const next = new Map(current);
                          next.delete(item.id);
                          return next;
                        });
                        await reload();
                      }
                    }}
                  >
                    <Check size={16} />
                  </button>
                </article>
              ))}
              {loading && !pageItems.length && (
                <div className="sediment-empty" role="status">
                  <LoaderCircle className="spin" size={26} />
                  <strong>正在读取沉积事项</strong>
                  <span>沿时间轨迹定位最久未处理的事项。</span>
                </div>
              )}
              {!loading && result && !pageItems.length && (
                <div className="sediment-empty">
                  <Clock3 size={26} />
                  <strong>这组沉积事项已经清空。</strong>
                  <span>调整筛选，或回到星图继续推进。</span>
                </div>
              )}
            </div>

            <div className="sediment-pagination">
              <span>
                第 {result?.page || page} / {Math.max(1, Math.ceil((result?.total || 0) / 50))} 页
              </span>
              <button
                aria-label="上一页沉积事项"
                disabled={page <= 1 || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((value) => value - 1);
                }}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                aria-label="下一页沉积事项"
                disabled={!result || page * result.limit >= result.total || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((value) => value + 1);
                }}
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <form
              className="sediment-reschedule"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!selectedItems.length || !dueAt) return;
                try {
                  const instant = zonedInstant(dueAt.slice(0, 10), dueAt.slice(11, 16), zone);
                  if (Date.parse(instant) <= Date.now()) {
                    setMessage('请选择未来的截止时间。');
                    return;
                  }
                  if (
                    await onBulkReschedule(
                      selectedItems.map(({ id, version }) => ({ id, version })),
                      instant,
                    )
                  ) {
                    setMessage(`已重新安排 ${selectedItems.length} 件事项。`);
                    setSelected(new Map());
                    setDueAt('');
                    await reload();
                  }
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              <CalendarClock size={18} />
              <label>
                <span className="sr-only">新的截止时间</span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  min={minDueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  disabled={!selected.size || busy || !writable}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={!selected.size || !dueAt || busy || !writable}
              >
                重新安排
              </button>
            </form>
            {message && (
              <div className="sediment-message" role="status">
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
