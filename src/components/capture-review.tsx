'use client';

import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { CaptureDraft } from '../../packages/core/src';
import type { CaptureInsight } from '../../packages/core/src/capture-experience';

const destinations = [
  { id: 3, name: '应变星区', detail: '不重要 · 紧急', color: '#b4a0f3' },
  { id: 1, name: '行动星区', detail: '重要 · 紧急', color: '#ffa88e' },
  { id: 4, name: '留白星区', detail: '不重要 · 不紧急', color: '#83dcf0' },
  { id: 2, name: '生长星区', detail: '重要 · 不紧急', color: '#d7ff4f' },
];

export function captureDestinationName(value: CaptureDraft) {
  return value.triageStatus === 'pending'
    ? '收件箱 · 待整理'
    : destinations.find((q) => q.id === value.quadrant)?.name || '四象限';
}

export function CaptureDestination({
  value,
  onChange,
  disabled,
  label = '放入位置',
}: {
  value: CaptureDraft;
  onChange: (patch: Partial<CaptureDraft>) => void;
  disabled?: boolean;
  label?: string;
}) {
  const name = useId();
  return (
    <fieldset className="capture-destination" disabled={disabled}>
      <legend>{label}</legend>
      <p className="capture-destination-help">选择星区，直接放入四象限</p>
      <div className="capture-quadrants">
        {destinations.map((q) => {
          const checked = value.triageStatus === 'triaged' && value.quadrant === q.id;
          return (
            <label
              className={`capture-quadrant ${checked ? 'is-selected' : ''}`}
              key={q.id}
              style={{ '--destination-color': q.color } as CSSProperties}
            >
              <input
                type="radio"
                name={name}
                value={q.id}
                checked={checked}
                onChange={() => onChange({ quadrant: q.id, triageStatus: 'triaged' })}
              />
              <span className="capture-quadrant-name">
                <span className="capture-orbit-dot" aria-hidden="true" />
                {q.name}
              </span>
              <small>{q.detail}</small>
              <span className="capture-choice-mark" aria-hidden="true">
                {checked && <Check size={15} />}
              </span>
            </label>
          );
        })}
      </div>
      <label className={`capture-inbox ${value.triageStatus === 'pending' ? 'is-selected' : ''}`}>
        <input
          type="radio"
          name={name}
          value="pending"
          checked={value.triageStatus === 'pending'}
          onChange={() => onChange({ triageStatus: 'pending' })}
        />
        <Inbox size={18} aria-hidden="true" />
        <span>
          <strong>先放收件箱</strong>
          <small>还没决定优先级，稍后整理</small>
        </span>
        <span className="capture-choice-mark" aria-hidden="true">
          {value.triageStatus === 'pending' && <Check size={15} />}
        </span>
      </label>
    </fieldset>
  );
}

export function CaptureTitle({
  value,
  onChange,
  label = '事项名称',
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [value]);
  return (
    <label className="capture-title-field">
      <span>{label}</span>
      <textarea
        ref={ref}
        rows={1}
        required
        maxLength={240}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="你想推进什么？"
      />
    </label>
  );
}

export function CaptureInsightNote({
  insight,
  onOpenSimilar,
}: {
  insight?: CaptureInsight;
  onOpenSimilar: (id: string) => void;
}) {
  if (!insight) return null;
  return (
    <div className="capture-insight-note">
      {insight.clarification && <p>{insight.clarification}</p>}
      {insight.classificationReason && (
        <details>
          <summary>
            查看整理依据 <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <p>{insight.classificationReason}</p>
        </details>
      )}
      {insight.similar.map((item) => (
        <button
          type="button"
          className="text-button"
          key={item.id}
          onClick={() => onOpenSimilar(item.id)}
        >
          已有相似事项：{item.title} · 查看
        </button>
      ))}
    </div>
  );
}

export function CaptureReview({
  value,
  onChange,
  onSave,
  onClose,
  busy,
  mode,
  notice,
  retryNote,
  onRetry,
  fallbackLabel,
  insight,
  onOpenSimilar,
  summary,
  fields,
  problems,
  error,
}: {
  value: CaptureDraft;
  onChange: (patch: Partial<CaptureDraft>) => void;
  onSave: () => void;
  onClose: () => void;
  busy: boolean;
  mode: string;
  notice: string;
  retryNote: string;
  onRetry: () => void;
  fallbackLabel?: string;
  insight?: CaptureInsight;
  onOpenSimilar: (id: string) => void;
  summary: string[];
  fields: ReactNode;
  problems: string[];
  error?: string;
}) {
  return (
    <form
      className="capture-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !problems.length && value.title.trim() && value.subtasks.length <= 12)
          onSave();
      }}
    >
      <div className="capture-body">
        <CaptureTitle
          value={value.title}
          onChange={(title) => onChange({ title })}
          disabled={busy}
        />
        {mode !== 'manual' && (
          <div className={`capture-source is-${mode}`} role="status">
            <span>
              {mode === 'ai' ? <Sparkles size={15} /> : <RefreshCw size={15} />}
              {mode === 'ai' ? 'AI 整理' : '规则草稿'}
            </span>
            <p>
              {retryNote ||
                (notice.startsWith('已恢复')
                  ? notice
                  : mode === 'rules'
                    ? '智能整理暂不可用，仍可选择星区并保存。'
                    : '内容可直接修改，放入位置由你决定。')}
            </p>
            {mode === 'rules' && (
              <button type="button" className="text-button" disabled={busy} onClick={onRetry}>
                {busy ? '正在尝试…' : '重新尝试 AI'}
              </button>
            )}
            {fallbackLabel && (
              <details>
                <summary>查看原因</summary>
                <p>{fallbackLabel}</p>
              </details>
            )}
          </div>
        )}
        <CaptureDestination value={value} onChange={onChange} disabled={busy} />
        {summary.length > 0 && (
          <ul className="capture-summary" aria-label="已安排信息">
            {summary.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        )}
        <CaptureInsightNote insight={insight} onOpenSimilar={onOpenSimilar} />
        <details className="capture-details">
          <summary>
            修改细节 <ChevronDown size={17} aria-hidden="true" />
          </summary>
          <fieldset className="capture-fields" disabled={busy}>
            {fields}
          </fieldset>
        </details>
        {problems.length > 0 && (
          <p className="field-error" role="alert">
            {[...new Set(problems)].join('；')}
          </p>
        )}
      </div>
      <footer className="capture-footer">
        {error && (
          <p className="field-error" role="alert">
            {error} · 内容已保留，可修改后重试。
          </p>
        )}
        <p aria-live="polite">
          将放入 <strong>{captureDestinationName(value)}</strong>
        </p>
        <div className="capture-footer-actions">
          <button type="button" className="text-button" onClick={onClose}>
            稍后继续
          </button>
          <button
            className="primary-button"
            disabled={
              busy || !value.title.trim() || problems.length > 0 || value.subtasks.length > 12
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : value.triageStatus === 'pending' ? (
              <Inbox size={17} />
            ) : (
              <ArrowUpRight size={17} />
            )}
            {busy ? '正在保存…' : value.triageStatus === 'pending' ? '保存到收件箱' : '放入四象限'}
          </button>
        </div>
      </footer>
    </form>
  );
}
