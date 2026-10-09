'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  WandSparkles,
  AlertCircle,
} from 'lucide-react';
import { zonedInstant, quadrantNames } from '../../packages/core/src';
import {
  dateInZone,
  shiftDate,
  standardReportDefinition,
  type ReportContext,
  type ReportSource,
  type ReportDefinition,
  type FoundryReport,
  type PersonalReportTemplate,
  type ReportPlan,
} from '../../packages/core/src/reports';

type Request = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
const statuses: Record<string, string> = {
  open: '待开始',
  doing: '进行中',
  blocked: '阻塞',
  done: '已完成',
};
const progressLabels: Record<string, string> = {
  created: '新增',
  updated: '推进',
  completed: '完成',
  reopened: '重开',
};
const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
function Drawer({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="foundry-drawer"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            closeRef.current();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭周报面板" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div className="foundry-drawer-body">{children}</div>
    </dialog>
  );
}
export function ReportFoundry({
  wid,
  zone,
  userId,
  writable,
  request,
  onOpen,
  onChanged,
  notify,
  reportTarget,
  sourceRevision,
}: {
  reportTarget: string | null;
  sourceRevision: string;
  wid: string;
  zone: string;
  userId: string;
  writable: boolean;
  request: Request;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const prefix = `workspaces/${wid}`;
  const [anchor, setAnchor] = useState(() => dateInZone(new Date(), zone)),
    [context, setContext] = useState<ReportContext | null>(null),
    [template, setTemplate] = useState<PersonalReportTemplate | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<Map<string, ReportSource>>(new Map()),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState('');
  const [reports, setReports] = useState<FoundryReport[]>([]),
    [report, setReport] = useState<FoundryReport | null>(null),
    [content, setContent] = useState(''),
    [view, setView] = useState<'materials' | 'editor' | 'plan'>('materials');
  const [drawer, setDrawer] = useState<'template' | 'sources' | 'archive' | null>(null),
    [definition, setDefinition] = useState<ReportDefinition>(standardReportDefinition),
    [samples, setSamples] = useState(''),
    [learningMode, setLearningMode] = useState(''),
    [onboarding, setOnboarding] = useState(false);
  const [extraPreset, setExtraPreset] = useState('previous'),
    [extraStart, setExtraStart] = useState(''),
    [extraEnd, setExtraEnd] = useState(''),
    [extraQuery, setExtraQuery] = useState(''),
    [extraStatus, setExtraStatus] = useState(''),
    [extraProject, setExtraProject] = useState(''),
    [extraPage, setExtraPage] = useState(1),
    [extraMode, setExtraMode] = useState('activity'),
    [extraRows, setExtraRows] = useState<{
      items: ReportSource[];
      total: number;
      page: number;
      limit: number;
    } | null>(null),
    [extraLoading, setExtraLoading] = useState(false);
  const [plan, setPlan] = useState<{
      drafts: ReportPlan[];
      batchId: string;
      version: number;
      mode: string;
    } | null>(null),
    [planSelected, setPlanSelected] = useState<Set<number>>(new Set()),
    [planImported, setPlanImported] = useState(false);
  const generation = useRef(0),
    dirty = Boolean(report && content !== report.content);
  useEffect(() => {
    let active = true;
    const id = ++generation.current;
    setLoading(true);
    setError('');
    setQuery('');
    setPage(1);
    setFilter('');
    Promise.all([
      request<ReportContext>(`${prefix}/reports/context?anchor=${anchor}`),
      request<FoundryReport[]>(`${prefix}/reports`),
    ])
      .then(([c, rs]) => {
        if (!active || id !== generation.current) return;
        setContext(c);
        setTemplate(c.template);
        setDefinition(c.template?.definition || standardReportDefinition);
        setSelected(new Map(c.candidates.map((i) => [i.id, i])));
        setReports(rs);
        setReport(null);
        setContent('');
        setPlan(null);
        setPlanImported(false);
        setOnboarding(!c.template);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [anchor, prefix, request]);
  useEffect(() => {
    if (!dirty) return;
    const listener = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty]);
  useEffect(() => {
    if (report?.suggestionStatus !== 'pending') return;
    let active = true;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        request<FoundryReport>(`${prefix}/reports/${report.id}`)
          .then((r) => {
            if (!active) return;
            if (r.version === report.version) setReport(r);
            else {
              clearInterval(timer);
              setError('周报已在其他设备更新。你的修改仍保留，请重新打开周报档案后编辑。');
            }
          })
          .catch(() => {});
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [report?.id, report?.version, report?.suggestionStatus, prefix, request]);
  const execute = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const setActive = (r: FoundryReport) => {
    if (dirty && !window.confirm('当前修改尚未保存，切换周报会放弃这些修改。继续吗？')) return;
    void execute('load-report', async () => {
      const latest = await request<FoundryReport>(`${prefix}/reports/${r.id}`);
      setReport(latest);
      setContent(latest.content);
      setReports((rs) => [latest, ...rs.filter((entry) => entry.id !== latest.id)]);
      setPlan(null);
      setPlanImported(Boolean(latest.planBatchId));
      setView('editor');
      setDrawer(null);
    });
  };
  const changeWeek = (next: string) => {
    if (dirty && !window.confirm('当前修改尚未保存，切换周会放弃这些修改。继续吗？')) return;
    setAnchor(next);
    setView('materials');
  };
  const toggle = (item: ReportSource) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  useEffect(() => {
    if (!reportTarget || loading) return;
    let active = true;
    request<FoundryReport>(`${prefix}/reports/${reportTarget}`)
      .then((r) => {
        if (active) {
          setReport(r);
          setContent(r.content);
          setView('editor');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [reportTarget, prefix, request, loading]);
  const lastSourceRevision = useRef(sourceRevision);
  useEffect(() => {
    if (lastSourceRevision.current === sourceRevision) return;
    lastSourceRevision.current = sourceRevision;
    let active = true;
    request<ReportContext>(`${prefix}/reports/context?anchor=${anchor}`)
      .then((c) => {
        if (!active) return;
        setContext(c);
        setSelected(
          (current) =>
            new Map(
              [...current].map(([id, item]) => [id, c.candidates.find((i) => i.id === id) || item]),
            ),
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [sourceRevision, prefix, request, anchor]);
  const candidates = context?.candidates || [];
  const visible = useMemo(
    () =>
      candidates.filter(
        (i) =>
          (!query || `${i.title}\n${i.notes}`.toLowerCase().includes(query.toLowerCase())) &&
          (!filter || i.status === filter),
      ),
    [candidates, query, filter],
  );
  const pages = Math.max(1, Math.ceil(visible.length / 50));
  const omitted = candidates.filter(
    (i) => !selected.has(i.id) && (i.status === 'blocked' || i.progressTypes.includes('completed')),
  );
  const supplemental = [...selected.values()].filter((i) => !candidates.some((c) => c.id === i.id));
  const currentDraft = reports.find(
    (r) => context && r.startAt === context.startAt && r.endAt === context.endAt,
  );
  const disabled = !writable || Boolean(busy);
  const projects = [
    ...new Map(
      [...candidates, ...(extraRows?.items || [])]
        .filter((i) => i.projectId && i.project)
        .map((i) => [i.projectId!, i.project!]),
    ).entries(),
  ];
  useEffect(() => {
    if (!context) return;
    if (extraPreset === 'previous') {
      setExtraStart(shiftDate(context.startDate, -7));
      setExtraEnd(context.startDate);
    } else if (extraPreset === 'month') {
      setExtraStart(shiftDate(context.startDate, -30));
      setExtraEnd(context.endDate);
    }
    setExtraPage(1);
  }, [extraPreset, context?.startDate]);
  useEffect(() => {
    if (drawer !== 'sources' || !extraStart || !extraEnd || extraEnd <= extraStart) return;
    let active = true;
    setExtraLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        startAt: zonedInstant(extraStart, '00:00', zone),
        endAt: zonedInstant(extraEnd, '00:00', zone),
        q: extraQuery,
        status: extraStatus,
        projectId: extraProject,
        page: String(extraPage),
        mode: extraMode,
      });
      request<typeof extraRows>(`${prefix}/reports/candidates?${params}`)
        .then((value) => {
          if (active) setExtraRows(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setExtraLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    drawer,
    extraStart,
    extraEnd,
    extraQuery,
    extraStatus,
    extraProject,
    extraPage,
    extraMode,
    prefix,
    zone,
    request,
  ]);
  const save = () =>
    report &&
    execute('save', async () => {
      const r = await request<FoundryReport>(`${prefix}/reports/${report.id}`, 'PATCH', {
        content,
        version: report.version,
      });
      setReport(r);
      setContent(r.content);
      setReports((rs) => [r, ...rs.filter((x) => x.id !== r.id)]);
      notify(
        r.suggestionStatus === 'pending' ? '周报已保存。风格建议将在后台准备。' : '周报已保存。',
      );
    });
  const generate = () =>
    context &&
    execute('generate', async () => {
      if (dirty && !window.confirm('重新生成会放弃尚未保存的修改。继续吗？')) return;
      const r = await request<FoundryReport>(`${prefix}/reports`, 'POST', {
        startAt: context.startAt,
        endAt: context.endAt,
        sourceIds: [...selected.keys()],
        ...(template ? { templateId: template.id, templateVersion: template.version } : {}),
      });
      setReport(r);
      setContent(r.content);
      setReports((rs) => [r, ...rs]);
      setView('editor');
      setPlan(null);
      setPlanImported(false);
      notify(
        r.generationMode === 'ai'
          ? '周报已按你的风格铸造。'
          : 'AI 暂时不可用，已生成有来源的规则草稿。',
      );
    });
  const extract = () =>
    report &&
    execute('plan', async () => {
      if (dirty) {
        setError('先保存周报，再提取最终稿中的下周计划。');
        return;
      }
      const result = await request<NonNullable<typeof plan>>(
        `${prefix}/reports/${report.id}/plan`,
        'POST',
        {},
      );
      setPlan(result);
      setPlanSelected(new Set(result.drafts.map((_, i) => i)));
      setPlanImported(false);
      setView('plan');
    });
  const row = (i: ReportSource) => (
    <div className={`foundry-source ${selected.has(i.id) ? 'is-selected' : ''}`} key={i.id}>
      <label className="foundry-source-check">
        <input
          type="checkbox"
          checked={selected.has(i.id)}
          disabled={disabled}
          onChange={() => toggle(i)}
          aria-label={`选入周报：${i.title}`}
        />
        <span>
          <strong>{i.title}</strong>
          <small>
            {i.project?.name || '独立事项'} · {statuses[i.status]}
            {i.archivedAt ? ' · 已归档' : ''}
          </small>
          <em>
            {i.progressTypes.map((t) => progressLabels[t] || t).join(' / ') || '补充材料'}
            {i.progressAt
              ? ` · ${new Intl.DateTimeFormat('zh-CN', { timeZone: zone, month: 'numeric', day: 'numeric' }).format(new Date(i.progressAt))}`
              : ''}
          </em>
        </span>
      </label>
      <button
        className="icon-button"
        aria-label={`编辑素材：${i.title}`}
        onClick={() => {
          setDrawer(null);
          onOpen(i.id);
        }}
      >
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
  return (
    <div className="report-foundry" aria-busy={loading || Boolean(busy)}>
      <header className="foundry-heading">
        <div>
          <h1>把这一周，铸成你的表达。</h1>
          <p>真实行动是素材，你的风格是模具。</p>
        </div>
        <div>
          <button
            className="secondary-button"
            onClick={() => {
              setDefinition(template?.definition || standardReportDefinition);
              setDrawer('template');
            }}
          >
            <SlidersHorizontal size={16} />
            我的写作风格
          </button>
          <button
            className="icon-button"
            aria-label="打开周报档案"
            onClick={() => setDrawer('archive')}
          >
            <History size={20} />
          </button>
        </div>
      </header>
      {error && (
        <div className="foundry-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button className="icon-button" aria-label="关闭周报错误" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <section className="foundry-week" aria-label="周报时间段">
        <div className="foundry-week-heading">
          <div>
            <button
              className="icon-button"
              aria-label="前一周"
              disabled={loading || Boolean(busy)}
              onClick={() => changeWeek(shiftDate(anchor, -7))}
            >
              <ChevronLeft size={18} />
            </button>
            <strong>
              {context
                ? `${context.startDate.slice(5).replace('-', '/')} — ${shiftDate(context.endDate, -1).slice(5).replace('-', '/')}`
                : '正在定位这一周'}
            </strong>
            <button
              className="icon-button"
              aria-label="后一周"
              disabled={loading || Boolean(busy)}
              onClick={() => changeWeek(shiftDate(anchor, 7))}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="text-button"
              disabled={loading || Boolean(busy)}
              onClick={() => changeWeek(dateInZone(new Date(), zone))}
            >
              回到本周
            </button>
          </div>
          <span>
            {context?.calendar.status === 'fallback'
              ? '调休日历暂未同步 · 按普通周历显示'
              : context?.calendar.status === 'cached'
                ? '使用已缓存的中国调休日历'
                : '中国调休日历'}{' '}
            · {zone}
          </span>
        </div>
        <div className="foundry-days">
          {(context?.days || []).map((day, i) => (
            <div
              key={day.date}
              className={`foundry-day is-${day.kind} ${day.date === dateInZone(new Date(), zone) ? 'is-today' : ''}`}
            >
              <span>周{weekDays[i]}</span>
              <strong>{day.date.slice(8)}</strong>
              <small>{day.kind === 'makeup' ? '调休上班' : day.name}</small>
              <div
                className="foundry-day-pulse"
                style={
                  {
                    '--pulse-size': `${Math.min(100, 12 + day.count * 12)}%`,
                  } as React.CSSProperties
                }
              />
              <em>{day.count} 项进展</em>
            </div>
          ))}
        </div>
        {context?.calendar.papers.length ? (
          <details className="foundry-calendar-source">
            <summary>查看日历来源与同步时间</summary>
            <span>
              {context.calendar.syncedAt
                ? new Date(context.calendar.syncedAt).toLocaleString('zh-CN', { timeZone: zone })
                : ''}
            </span>
            {context.calendar.papers.map((p) => (
              <a href={p} target="_blank" rel="noreferrer" key={p}>
                国务院节假日安排 <ArrowUpRight size={12} />
              </a>
            ))}
          </details>
        ) : null}
      </section>
      {loading ? (
        <div className="foundry-loading" role="status">
          <LoaderCircle className="spin" />
          正在汇集这一周的行动…
        </div>
      ) : (
        <>
          {onboarding && writable && (
            <section className="foundry-onboarding">
              <WandSparkles size={26} />
              <div>
                <h2>让 AI 学会你的周报习惯。</h2>
                <p>粘贴几篇历史周报，提炼可编辑的格式与语气。原文不长期保存。</p>
              </div>
              <button className="primary-button" onClick={() => setDrawer('template')}>
                导入历史周报
              </button>
              <button
                className="text-button"
                disabled={disabled}
                onClick={() =>
                  execute('template', async () => {
                    const t = await request<PersonalReportTemplate>(
                      `${prefix}/report-template`,
                      'PATCH',
                      { definition: standardReportDefinition, version: 0 },
                    );
                    setTemplate(t);
                    setOnboarding(false);
                  })
                }
              >
                先用标准风格
              </button>
            </section>
          )}
          <nav className="foundry-mobile-tabs" aria-label="周报步骤">
            {[
              ['materials', '选素材'],
              ['editor', '写周报'],
              ['plan', '下周点火'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={view === id ? 'is-active' : ''}
                onClick={() => setView(id as typeof view)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className={`foundry-workspace view-${view}`}>
            <section className="foundry-materials">
              <header>
                <div>
                  <h2>行动素材</h2>
                  <span>
                    {context?.total || 0} 项本周进展 · 已选 {selected.size}
                  </span>
                </div>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => setDrawer('sources')}
                >
                  <Plus size={16} />
                  添加其他时期
                </button>
              </header>
              <div className="foundry-material-controls">
                <label className="foundry-search">
                  <Search size={16} />
                  <input
                    aria-label="搜索本周素材"
                    placeholder="找一项行动…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <select
                  aria-label="筛选本周素材状态"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">全部状态</option>
                  {Object.entries(statuses).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="foundry-selection-tools">
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => setSelected(new Map(candidates.map((i) => [i.id, i])))}
                >
                  选中全部本周
                </button>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() => setSelected(new Map())}
                >
                  清空选择
                </button>
                <span>只记录实质进展</span>
              </div>
              {omitted.length > 0 && (
                <details className="foundry-radar">
                  <summary>
                    <AlertCircle size={14} />
                    遗漏雷达：{omitted.length} 项完成或阻塞未选入
                  </summary>
                  {omitted.map((i) => (
                    <button key={i.id} disabled={disabled} onClick={() => toggle(i)}>
                      {i.title}
                      <Plus size={14} />
                    </button>
                  ))}
                </details>
              )}
              <div className="foundry-source-list">
                {visible.length ? (
                  [
                    ...new Map(
                      visible
                        .slice((page - 1) * 50, page * 50)
                        .map((i) => [i.projectId || '', i.project?.name || '独立事项']),
                    ).entries(),
                  ].map(([projectId, name]) => (
                    <div className="foundry-project-group" key={projectId}>
                      <h3>{name}</h3>
                      {visible
                        .slice((page - 1) * 50, page * 50)
                        .filter((i) => (i.projectId || '') === projectId)
                        .map(row)}
                    </div>
                  ))
                ) : (
                  <div className="foundry-empty">
                    <FileText size={28} />
                    <h3>这里还没有可用素材。</h3>
                    <p>本周创建或推动事项后会自动出现，也可以从其他时期补选。</p>
                  </div>
                )}
              </div>
              {pages > 1 && (
                <div className="foundry-pagination">
                  <button
                    className="icon-button"
                    aria-label="上一页素材"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    {page} / {pages}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="下一页素材"
                    disabled={page >= pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
              {supplemental.length > 0 && (
                <div className="foundry-supplemental">
                  <h3>补充材料 · {supplemental.length}</h3>
                  {supplemental.map(row)}
                </div>
              )}
              <footer className="foundry-generate">
                <div>
                  <strong>{selected.size} 项已就绪</strong>
                  <small>
                    {selected.size > 200
                      ? '最多 200 项，请减少选择'
                      : template
                        ? `${template.definition.name} · v${template.version}`
                        : 'Orbit 标准风格'}
                  </small>
                </div>
                <button
                  className="primary-button"
                  disabled={disabled || !selected.size || selected.size > 200}
                  onClick={generate}
                >
                  {busy === 'generate' ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Sparkles size={17} />
                  )}
                  铸造本周周报
                </button>
              </footer>
            </section>
            <section className="foundry-editor">
              <header>
                <div>
                  <h2>{report ? '你的周报' : '表达，即将成形。'}</h2>
                  <span>
                    {report
                      ? `${report.generationMode === 'ai' ? 'AI 仿写' : '规则草稿'} · ${report.sourceIds.length} 项来源${dirty ? ' · 未保存' : ''}`
                      : '选好素材，按你的风格生成。'}
                  </span>
                </div>
                {report && (
                  <div className="foundry-editor-actions">
                    <button
                      className="icon-button"
                      aria-label="复制周报"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(content)
                          .then(() => notify('已复制周报。'))
                          .catch(() => setError('复制失败，请手动选择正文复制。'))
                      }
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="下载周报"
                      onClick={() => {
                        const url = URL.createObjectURL(
                          new Blob([content], { type: 'text/markdown' }),
                        );
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `orbit-report-${report.startAt.slice(0, 10)}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      className="secondary-button"
                      disabled={disabled || !dirty}
                      onClick={save}
                    >
                      {busy === 'save' ? '保存中…' : '保存草稿'}
                    </button>
                  </div>
                )}
              </header>
              {report ? (
                <>
                  <textarea
                    aria-label="周报内容"
                    value={content}
                    readOnly={!writable || Boolean(busy)}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                  />
                  {report.authorId === userId &&
                    report.suggestionStatus === 'ready' &&
                    report.styleSuggestion && (
                      <section className="foundry-style-suggestion">
                        <Sparkles size={18} />
                        <div>
                          <h3>这次修改，可以成为下次的习惯。</h3>
                          <p>{report.styleSuggestion.reason}</p>
                          <details>
                            <summary>预览模板变化</summary>
                            <p>{report.styleSuggestion.definition.tone}</p>
                            <pre>{report.styleSuggestion.definition.skeleton}</pre>
                          </details>
                          <div>
                            <button
                              className="secondary-button"
                              disabled={disabled}
                              onClick={() =>
                                execute('style', async () => {
                                  await request(`${prefix}/reports/${report.id}/style`, 'POST', {
                                    decision: 'accept',
                                    version: report.version,
                                    templateVersion: report.styleSuggestion!.templateVersion,
                                  });
                                  setTemplate(await request(`${prefix}/report-template`));
                                  setReport({ ...report, suggestionStatus: 'accepted' });
                                  notify('风格已更新，下次周报会沿用。');
                                })
                              }
                            >
                              吸收为我的风格
                            </button>
                            <button
                              className="text-button"
                              disabled={disabled}
                              onClick={() =>
                                execute('style', async () => {
                                  await request(`${prefix}/reports/${report.id}/style`, 'POST', {
                                    decision: 'ignore',
                                    version: report.version,
                                    templateVersion: report.styleSuggestion!.templateVersion,
                                  });
                                  setReport({ ...report, suggestionStatus: 'ignored' });
                                })
                              }
                            >
                              忽略
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                  {report.suggestionStatus === 'pending' && (
                    <p className="foundry-pending">
                      <LoaderCircle size={14} className="spin" />
                      风格建议正在后台准备，周报已保存。
                    </p>
                  )}
                  <details className="foundry-evidence" open>
                    <summary>回到真实行动 · {report.sourceIds.length}</summary>
                    <div>
                      {report.sourceIds.map((id) => (
                        <button key={id} onClick={() => onOpen(id)}>
                          {report.sourceSnapshot?.find((i) => i.id === id)?.title || '查看来源事项'}
                          <ArrowUpRight size={13} />
                        </button>
                      ))}
                    </div>
                  </details>
                  <footer className="foundry-next">
                    <Rocket size={21} />
                    <div>
                      <strong>下周点火</strong>
                      <span>把最终稿中的计划变成可编辑事项草稿。</span>
                    </div>
                    <button className="secondary-button" disabled={disabled} onClick={extract}>
                      提取下周计划
                    </button>
                  </footer>
                </>
              ) : (
                <div className="foundry-blank">
                  <div className="foundry-orbit-mark">
                    <FileText size={36} />
                    <span />
                    <span />
                  </div>
                  <h3>
                    行动已经发生，
                    <br />
                    现在让它被看见。
                  </h3>
                  <p>每段成果保留来源，每次表达更像你。</p>
                  {currentDraft && (
                    <button className="secondary-button" onClick={() => setActive(currentDraft)}>
                      继续本周已保存草稿
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  <button className="text-button" onClick={() => setDrawer('archive')}>
                    打开周报档案
                  </button>
                </div>
              )}
            </section>
            <section className="foundry-plan">
              <header>
                <Rocket size={22} />
                <div>
                  <h2>下周点火</h2>
                  <p>先检查草稿，再放入你的宇宙。</p>
                </div>
              </header>
              {!plan ? (
                <div className="foundry-empty">
                  <p>{report ? '从已保存的周报中提取下周计划。' : '先生成并保存一份周报。'}</p>
                  <button
                    className="secondary-button"
                    disabled={disabled || !report}
                    onClick={extract}
                  >
                    提取下周计划
                  </button>
                </div>
              ) : (
                <>
                  <p className="foundry-plan-note">
                    {planImported
                      ? `${planSelected.size} 项事项已创建，可在星图查看。`
                      : `${plan.mode === 'ai' ? 'AI 已提取' : '使用文本规则提取'} ${plan.drafts.length} 项 · 尚未创建事项`}
                  </p>
                  {plan.drafts.map((draft, i) => (
                    <div className="foundry-plan-row" key={i}>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`导入计划 ${i + 1}`}
                          checked={planSelected.has(i)}
                          disabled={disabled || planImported}
                          onChange={() =>
                            setPlanSelected((current) => {
                              const next = new Set(current);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                        />
                        计划 {i + 1}
                      </label>
                      <label>
                        事项名称
                        <input
                          value={draft.title}
                          disabled={disabled || planImported}
                          onChange={(e) =>
                            setPlan({
                              ...plan,
                              drafts: plan.drafts.map((d, j) =>
                                j === i ? { ...d, title: e.target.value } : d,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        说明
                        <textarea
                          value={draft.notes}
                          disabled={disabled || planImported}
                          onChange={(e) =>
                            setPlan({
                              ...plan,
                              drafts: plan.drafts.map((d, j) =>
                                j === i ? { ...d, notes: e.target.value } : d,
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          象限
                          <select
                            value={draft.quadrant}
                            disabled={disabled || planImported}
                            onChange={(e) =>
                              setPlan({
                                ...plan,
                                drafts: plan.drafts.map((d, j) =>
                                  j === i ? { ...d, quadrant: Number(e.target.value) } : d,
                                ),
                              })
                            }
                          >
                            {Object.entries(quadrantNames).map(([n, l]) => (
                              <option key={n} value={n}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          截止日期
                          <input
                            type="date"
                            value={draft.dueAt ? dateInZone(new Date(draft.dueAt), zone) : ''}
                            disabled={disabled || planImported}
                            onChange={(e) =>
                              setPlan({
                                ...plan,
                                drafts: plan.drafts.map((d, j) =>
                                  j === i
                                    ? {
                                        ...d,
                                        dueAt: e.target.value
                                          ? zonedInstant(e.target.value, '18:00', zone)
                                          : null,
                                      }
                                    : d,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {!plan.drafts.length && (
                    <div className="foundry-empty">
                      <h3>没有发现明确的下周计划。</h3>
                      <p>在正文补充“下周计划”章节并保存后，可以重新提取。</p>
                    </div>
                  )}
                  <button
                    className="primary-button"
                    disabled={
                      disabled ||
                      planImported ||
                      !planSelected.size ||
                      plan.drafts.some((d, i) => planSelected.has(i) && !d.title.trim())
                    }
                    onClick={() =>
                      report &&
                      execute('import', async () => {
                        await request(`${prefix}/reports/${report.id}/plan-items`, 'POST', {
                          batchId: plan.batchId,
                          version: plan.version,
                          drafts: plan.drafts.filter((_, i) => planSelected.has(i)),
                        });
                        setPlanImported(true);
                        await onChanged();
                        notify(`${planSelected.size} 项计划已放入 Orbit。`);
                      })
                    }
                  >
                    {planImported ? <Check size={17} /> : <Rocket size={17} />}{' '}
                    {planImported ? '计划已进入轨道' : `确认创建 ${planSelected.size} 项事项`}
                  </button>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {drawer === 'template' && (
        <Drawer title="我的写作风格" close={() => setDrawer(null)}>
          <div className="foundry-template-intro">
            <WandSparkles size={24} />
            <h3>只学表达方式，保留你的个性。</h3>
            <p>
              输入 1–5 篇历史周报，多篇之间用独立一行的 --- 分隔。样本最多 60,000
              字符；仅保存你确认的风格模板。
            </p>
          </div>
          <label>
            历史周报样本
            <textarea
              aria-label="历史周报样本"
              className="foundry-samples"
              value={samples}
              maxLength={60000}
              disabled={disabled}
              onChange={(e) => setSamples(e.target.value)}
              placeholder="粘贴历史周报…"
            />
          </label>
          <button
            className="secondary-button"
            disabled={disabled || !samples.trim()}
            onClick={() =>
              execute('learn', async () => {
                const result = await request<{ definition: ReportDefinition; mode: string }>(
                  `${prefix}/report-template/learn`,
                  'POST',
                  {
                    samples: samples
                      .split(/^---\s*$/m)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                );
                setDefinition(result.definition);
                setLearningMode(result.mode);
                setSamples('');
              })
            }
          >
            {busy === 'learn' ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            提炼我的风格
          </button>
          {learningMode && (
            <p role="status">
              {learningMode === 'ai'
                ? '风格已提炼，检查后保存。'
                : 'AI 暂时不可用，可编辑下方标准模板。'}
            </p>
          )}
          <div className="foundry-template-fields">
            {(
              [
                ['name', '模板名称'],
                ['tone', '语气与表达'],
                ['length', '篇幅习惯'],
                ['formatting', '格式与编号'],
                ['avoid', '避免的表达'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  value={definition[key]}
                  disabled={disabled}
                  maxLength={key === 'name' ? 80 : key === 'length' ? 500 : 1500}
                  rows={key === 'name' ? 1 : 2}
                  onChange={(e) => setDefinition({ ...definition, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Markdown 结构模板
              <textarea
                className="foundry-skeleton"
                value={definition.skeleton}
                disabled={disabled}
                maxLength={8000}
                onChange={(e) => setDefinition({ ...definition, skeleton: e.target.value })}
              />
              <small>
                内容占位：{'{{completed}}'}、{'{{progress}}'}、{'{{next}}'}。可自由编辑章节。
              </small>
            </label>
          </div>
          <button
            className="primary-button"
            disabled={disabled || !definition.name.trim() || !definition.skeleton.trim()}
            onClick={() =>
              execute('template', async () => {
                const saved = await request<PersonalReportTemplate>(
                  `${prefix}/report-template`,
                  'PATCH',
                  { definition, version: template?.version || 0 },
                );
                setTemplate(saved);
                setOnboarding(false);
                setDrawer(null);
                notify('个人风格已保存。');
              })
            }
          >
            <Check size={16} />
            确认保存风格
          </button>
        </Drawer>
      )}
      {drawer === 'sources' && (
        <Drawer title="添加其他时期的事项" close={() => setDrawer(null)}>
          <div className="foundry-extra-filters">
            <label>
              时间段
              <select value={extraPreset} onChange={(e) => setExtraPreset(e.target.value)}>
                <option value="previous">上周</option>
                <option value="month">近 30 天</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <div className="form-grid">
              <label>
                开始日期
                <input
                  type="date"
                  value={extraStart}
                  onChange={(e) => {
                    setExtraPreset('custom');
                    setExtraStart(e.target.value);
                    setExtraPage(1);
                  }}
                />
              </label>
              <label>
                结束日期（不含）
                <input
                  type="date"
                  value={extraEnd}
                  onChange={(e) => {
                    setExtraPreset('custom');
                    setExtraEnd(e.target.value);
                    setExtraPage(1);
                  }}
                />
              </label>
            </div>
            <label>
              检索方式
              <select
                value={extraMode}
                onChange={(e) => {
                  setExtraMode(e.target.value);
                  setExtraPage(1);
                }}
              >
                <option value="activity">这段时间有实质进展</option>
                <option value="all">发生时间在这段时间（含归档）</option>
              </select>
            </label>
            <input
              aria-label="搜索扩展素材"
              placeholder="关键词…"
              value={extraQuery}
              onChange={(e) => {
                setExtraQuery(e.target.value);
                setExtraPage(1);
              }}
            />
            <div className="form-grid">
              <select
                aria-label="扩展素材项目"
                value={extraProject}
                onChange={(e) => {
                  setExtraProject(e.target.value);
                  setExtraPage(1);
                }}
              >
                <option value="">全部项目</option>
                {projects.map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="扩展素材状态"
                value={extraStatus}
                onChange={(e) => {
                  setExtraStatus(e.target.value);
                  setExtraPage(1);
                }}
              >
                <option value="">全部状态</option>
                {Object.entries(statuses).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="foundry-extra-summary">已选 {selected.size} 项 · 切换筛选保留选择</p>
          {extraEnd <= extraStart ? (
            <p role="alert">结束日期必须晚于开始日期。</p>
          ) : extraLoading ? (
            <div className="foundry-loading" role="status">
              <LoaderCircle className="spin" />
              正在寻找素材…
            </div>
          ) : extraRows?.items.length ? (
            extraRows.items.map(row)
          ) : (
            <p>这个区间没有匹配事项。</p>
          )}
          {extraRows && extraRows.total > 50 && (
            <div className="foundry-pagination">
              <button
                className="icon-button"
                aria-label="上一页扩展素材"
                disabled={extraPage <= 1}
                onClick={() => setExtraPage((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {extraPage} / {Math.ceil(extraRows.total / 50)} · {extraRows.total} 项
              </span>
              <button
                className="icon-button"
                aria-label="下一页扩展素材"
                disabled={extraPage * 50 >= extraRows.total}
                onClick={() => setExtraPage((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
          <button className="primary-button" onClick={() => setDrawer(null)}>
            <Check size={16} />
            完成选择
          </button>
        </Drawer>
      )}
      {drawer === 'archive' && (
        <Drawer title="周报档案" close={() => setDrawer(null)}>
          {reports.length ? (
            reports.map((r) => (
              <button className="foundry-archive-row" key={r.id} onClick={() => setActive(r)}>
                <FileText size={20} />
                <span>
                  <strong>
                    {dateInZone(new Date(r.startAt), zone)} —{' '}
                    {dateInZone(new Date(Date.parse(r.endAt) - 1), zone)}
                  </strong>
                  <small>
                    {r.sourceIds.length} 项来源 ·{' '}
                    {r.generationMode === 'ai'
                      ? 'AI 仿写'
                      : r.generationMode === 'legacy'
                        ? '历史草稿'
                        : '规则草稿'}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))
          ) : (
            <div className="foundry-empty">
              <h3>第一份周报，等你铸造。</h3>
              <p>生成后的草稿会永久保留在这里。</p>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
