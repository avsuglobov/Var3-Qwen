"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { ImportCard, type ImportResultView, type ImportStep } from "@/components/leads/import-card";
import { ReactivationCard } from "@/components/leads/reactivation-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useAgents, useChannels, useCreateLeads, useFunnels, useLeads } from "@/lib/api/hooks";
import { guessMapping, parseFile, type MappingColumn, type ParsedFile } from "@/lib/importer";
import type { Lead } from "@/lib/schemas";
import { buildImportedLeads, collectRows, downloadImportTemplate, importedLeads } from "@/lib/selectors/leads";

/**
 * Раздел «Лиды и автокасания» (этап 3, группа 4): импорт базы из .xlsx/.csv с сопоставлением
 * колонок и пакетным созданием лидов, шаблон CSV, сценарий реактивации. Машина состояний
 * импорта — drop → loading → map → done / error (как в прототипе); состояния loading/error/success.
 */
export function LeadsView() {
  const leadsQ = useLeads();
  const funnelsQ = useFunnels();
  const channelsQ = useChannels();
  const agentsQ = useAgents();
  const importLeads = useCreateLeads();

  const [step, setStep] = useState<ImportStep>("drop");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<MappingColumn[]>([]);
  const [funnelId, setFunnelId] = useState("fn-sales");
  const [channelId, setChannelId] = useState<Lead["channel"]>("site");
  const [result, setResult] = useState<ImportResultView | null>(null);
  const [errorText, setErrorText] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const clearFeedback = (): void => setFeedback({ text: "", kind: "status" });

  const pickFile = (file: File): void => {
    clearFeedback();
    setFileName(file.name);
    setStep("loading");
    parseFile(file)
      .then((res) => {
        setParsed(res);
        setMapping(guessMapping(res.headers));
        setFunnelId("fn-sales");
        setChannelId("site");
        setStep("map");
      })
      .catch((e: unknown) => {
        setErrorText(e instanceof Error && e.message ? e.message : "Не удалось прочитать файл");
        setStep("error");
      });
  };

  const reset = (): void => {
    setStep("drop");
    setParsed(null);
    setMapping([]);
    setResult(null);
    setErrorText("");
    clearFeedback();
  };

  const doImport = (): void => {
    if (!parsed) return;
    if (!mapping.includes("name")) {
      document.getElementById("map-0")?.focus();
      requestAnimationFrame(() => document.getElementById("map-0")?.focus());
      setFeedback({ text: "Укажите колонку «Имя клиента»", kind: "alert" });
      return;
    }
    const collected = collectRows(parsed.rows, mapping);
    if (!collected.list.length) {
      setFeedback({ text: "Нет строк с именем клиента — нечего импортировать", kind: "alert" });
      return;
    }
    const funnel = funnelsQ.data?.find((f) => f.id === funnelId) ?? funnelsQ.data?.[0];
    const built = buildImportedLeads({
      rows: collected.list,
      leads: leadsQ.data ?? [],
      funnelId: funnel?.id ?? funnelId,
      agentId: funnel?.agentId ?? "ag-sales",
      channel: channelId
    });
    importLeads.mutate(built, {
      onSuccess: (made) => {
        setResult({
          created: made.length,
          noName: collected.noName,
          dup: collected.dup,
          funnelId: funnel?.id ?? funnelId,
          funnelName: funnel?.name ?? "—"
        });
        setParsed(null);
        setStep("done");
        setFeedback({ text: `Импортировано лидов: ${made.length}`, kind: "status" });
      },
      onError: (e) => {
        setErrorText(e.message);
        setStep("error");
      }
    });
  };

  const onTemplate = (): void => {
    downloadImportTemplate();
    setFeedback({ text: "Шаблон скачан (CSV, открывается в Excel)", kind: "status" });
  };

  const loading = leadsQ.isPending || funnelsQ.isPending || channelsQ.isPending;
  const error = leadsQ.isError || funnelsQ.isError || channelsQ.isError ? leadsQ.error ?? funnelsQ.error ?? channelsQ.error : null;
  const imported = leadsQ.data ? importedLeads(leadsQ.data).length : null;
  const agentName = agentsQ.data?.find((a) => a.id === "ag-sales")?.name ?? "Продажи";
  const funnels = funnelsQ.data ?? [];
  const channels = channelsQ.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <header className="min-w-0">
        <h1 className="text-[28px] leading-tight">Лиды и автокасания</h1>
        <p className="mt-1 text-sm text-muted-foreground">Импорт базы и сценарий реактивации</p>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onTemplate} data-testid="leads-template-btn">
            <Download className="size-3.5" aria-hidden />
            Шаблон (CSV)
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1fr_1fr]" aria-busy="true" aria-label="Загрузка лидов">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : error ? (
        <ErrorState
          message={error.message}
          onRetry={() => { void leadsQ.refetch(); void funnelsQ.refetch(); void channelsQ.refetch(); }}
        />
      ) : (
        <>
          {feedback.text ? (
            <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="leads-feedback">
              {feedback.text}
            </p>
          ) : null}
          <ImportCard
            step={step}
            fileName={fileName}
            parsed={parsed}
            mapping={mapping}
            funnels={funnels}
            channels={channels}
            funnelId={funnelId}
            channelId={channelId}
            result={result}
            error={errorText}
            onPickFile={pickFile}
            onReset={reset}
            onMappingChange={(col, value) => setMapping((m) => m.map((v, i) => (i === col ? value : v)))}
            onFunnelChange={setFunnelId}
            onChannelChange={(id) => setChannelId(id as Lead["channel"])}
            onImport={doImport}
          />
          <div className="min-w-0 space-y-2">
            <div className="section-label">Сценарий реактивации базы</div>
            <ReactivationCard importedCount={imported === 0 ? null : imported} agentName={agentName} />
          </div>
        </>
      )}
    </div>
  );
}
