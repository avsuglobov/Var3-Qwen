"use client";

import { AlertTriangle, Check, Download, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FIELDS, MAX_ROWS, type MappingColumn, type ParsedFile } from "@/lib/importer";
import { cn } from "@/lib/utils";

/**
 * Карточка импорта (этап 3, группа 4): машина состояний прототипа
 * («drop» → «loading» → «map» → «done» / «error») с превью первых строк,
 * сопоставлением колонок и выбором воронки/канала. Состояние владеет LeadsView.
 */

export type ImportStep = "drop" | "loading" | "map" | "done" | "error";

export interface ImportResultView {
  created: number;
  noName: number;
  dup: number;
  funnelId: string;
  funnelName: string;
}

export interface ImportCardProps {
  step: ImportStep;
  fileName: string;
  parsed: ParsedFile | null;
  mapping: MappingColumn[];
  funnels: readonly { id: string; name: string }[];
  channels: readonly { id: string; name: string }[];
  funnelId: string;
  channelId: string;
  result: ImportResultView | null;
  error: string;
  onPickFile: (file: File) => void;
  onReset: () => void;
  onMappingChange: (col: number, value: MappingColumn) => void;
  onFunnelChange: (id: string) => void;
  onChannelChange: (id: string) => void;
  onImport: () => void;
}

/** Подсказка dropzone: лимиты подставляются из общих констант импорта (как в прототипе). */
const DROP_HINT = `или нажмите, чтобы выбрать файл. До ${MAX_ROWS} строк и 5 МБ, первая строка — заголовки.`;

export function ImportCard(props: ImportCardProps) {
  const { step, onPickFile, onReset } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handlePick = (): void => inputRef.current?.click();

  const handleInput = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPickFile(file);
  };

  return (
    <Card className="p-5" data-testid="leads-import-card">
      <h2 className="mb-4 text-[15px] font-medium leading-tight">Импорт из Excel и CSV</h2>

      {step === "drop" ? (
        /* Зона — только drag-таргет: drag это мышиное взаимодействие, поэтому не делаем её фальшивой
           role=button (axe: nested-interactive внутри настоящей кнопки, mismatch aria-label).
           Доступный способ выбрать файл — кнопка «Выбрать файл» ниже (мышь и клавиатура). */
        <div
          data-testid="leads-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex min-w-0 flex-col items-center gap-2 rounded-card border border-dashed border-border p-8 text-center transition-colors",
            dragOver ? "bg-muted border-primary" : "hover:bg-muted"
          )}
        >
          <Upload className="size-7 text-muted-foreground" aria-hidden />
          <div className="text-sm font-medium">Перетащите файл .xlsx или .csv сюда</div>
          <div className="text-[13px] text-muted-foreground-strong">{DROP_HINT}</div>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={handlePick} data-testid="leads-pick-file">
            <Download className="size-3.5" aria-hidden />
            Выбрать файл
          </Button>
        </div>
      ) : null}

      {step === "loading" ? (
        <div className="flex flex-col items-center gap-3 p-6" role="status" data-testid="leads-loading">
          <RefreshCw className="size-7 animate-spin text-muted-foreground" aria-hidden />
          <div className="text-sm font-medium">Читаю файл «{props.fileName}»…</div>
          <div className="text-[13px] text-muted-foreground">Это занимает несколько секунд</div>
        </div>
      ) : null}

      {step === "error" ? (
        <div className="flex flex-col items-start gap-3 p-6" role="alert" data-testid="leads-error">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-critical" aria-hidden />
            <span className="text-sm font-medium">Не удалось импортировать</span>
          </div>
          <p className="text-sm text-muted-foreground">{props.error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onReset} data-testid="leads-reset">
            Выбрать другой файл
          </Button>
        </div>
      ) : null}

      {step === "done" && props.result ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center" role="status" data-testid="leads-done">
          <Check className="size-7 text-status" aria-hidden />
          <div className="text-sm font-medium">Импортировано лидов: {props.result.created}</div>
          <div className="text-[13px] text-muted-foreground">
            Пропущено: без имени — {props.result.noName}, повторов — {props.result.dup}. Лиды добавлены в воронку «{props.result.funnelName}».
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="secondary" size="sm" data-testid="leads-open-crm">
              <Link href={`/crm?view=table&funnel=${encodeURIComponent(props.result.funnelId)}`}>Открыть в CRM</Link>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onReset} data-testid="leads-again">
              Импортировать ещё
            </Button>
          </div>
        </div>
      ) : null}

      {step === "map" && props.parsed ? <MapStep {...props} parsed={props.parsed} /> : null}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInput}
        data-testid="leads-file-input"
      />
    </Card>
  );
}

/** Шаг сопоставления: превью первых строк, селекты колонок, воронка и канал по умолчанию. */
function MapStep({
  parsed,
  fileName,
  mapping,
  funnels,
  channels,
  funnelId,
  channelId,
  onMappingChange,
  onFunnelChange,
  onChannelChange,
  onImport,
  onReset
}: Omit<ImportCardProps, "parsed"> & { parsed: ParsedFile }) {
  const firstRows = parsed.rows.slice(0, 5);
  return (
    <div data-testid="leads-map">
      <p className="mb-3 text-[13px] text-muted-foreground">
        Файл «{fileName}»: строк с данными — {parsed.total}
        {parsed.truncated ? ` (будут импортированы первые ${MAX_ROWS})` : ""}
      </p>

      <div className="section-label mb-2">Превью первых строк</div>
      <div className="mb-5 min-w-0 overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-max text-sm" data-testid="leads-preview">
          <thead>
            <tr className="border-b border-border bg-muted">
              {parsed.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {firstRows.map((row, r) => (
              <tr key={r} className="border-b border-border last:border-b-0">
                {row.map((cell, c) => (
                  <td key={c} className="max-w-64 truncate px-3 py-2 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-label mb-2">Сопоставление колонок</div>
      <div className="mb-5 grid min-w-0 gap-3 sm:grid-cols-2">
        {parsed.headers.map((h, i) => {
          const sample = parsed.rows[0]?.[i] ?? "";
          return (
            <div key={i} className="min-w-0">
              <label className="section-label mb-1.5 flex flex-wrap items-baseline" htmlFor={`map-${i}`}>
                {h}
                {sample ? <span className="text-muted-foreground"> (пример: {sample.length > 24 ? sample.slice(0, 24) + "…" : sample})</span> : null}
              </label>
              <select
                id={`map-${i}`}
                value={mapping[i] ?? "skip"}
                onChange={(e) => onMappingChange(i, e.target.value as MappingColumn)}
                className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                data-mapcol={i}
                data-testid="leads-map-select"
              >
                {FIELDS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <div className="mb-5 grid min-w-0 gap-3 sm:grid-cols-2">
        <div>
          <label className="section-label mb-1.5" htmlFor="importFunnel">
            Воронка
          </label>
          <select
            id="importFunnel"
            value={funnelId}
            onChange={(e) => onFunnelChange(e.target.value)}
            className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="leads-funnel-select"
          >
            {funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="section-label mb-1.5" htmlFor="importChannel">
            Канал по умолчанию
          </label>
          <select
            id="importChannel"
            value={channelId}
            onChange={(e) => onChannelChange(e.target.value)}
            className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="leads-channel-select"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onImport} data-testid="leads-do-import">
          <Check className="size-3.5" aria-hidden />
          Импортировать
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onReset} data-testid="leads-cancel">
          Отмена
        </Button>
      </div>
    </div>
  );
}
