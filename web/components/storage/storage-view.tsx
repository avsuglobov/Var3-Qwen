"use client";

import { BarChart3, Code, FileText, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state";
import { useCompanyProfile, useKnowledgeSources, useSaveCompanyProfile } from "@/lib/api/hooks";
import { SOURCE_TYPE_LABEL, sourceStatusTone, sourceTypeOf, type SourceType } from "@/lib/selectors/storage";
import { cn } from "@/lib/utils";

const SOURCE_ICON: Record<SourceType, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  xlsx: BarChart3,
  web: Globe,
  api: Code
};

/**
 * Раздел «Хранилище и база знаний» (этап 3, группа 7) — поведение storage() прототипа:
 * описание компании (редактируется и сохраняется), переключатель «Искать в интернете»,
 * таблица источников знаний с типами и статусами. Кнопки прототипа с пометкой «скоро»
 * («Добавить источник», «Настроить») не переносятся — в приложении только доступные действия.
 */
export function StorageView() {
  const profileQ = useCompanyProfile();
  const sourcesQ = useKnowledgeSources();
  const save = useSaveCompanyProfile();
  const [webSearch, setWebSearch] = useState(true);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [audience, setAudience] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });

  // Демо-профиль заполняет форму после загрузки; правки пользователя не перетираются повторной загрузкой
  useEffect(() => {
    if (profileQ.data && !name && !about && !audience) {
      setName(profileQ.data.name);
      setAbout(profileQ.data.about);
      setAudience(profileQ.data.audience);
    }
  }, [profileQ.data, name, about, audience]);

  const loading = profileQ.isPending || sourcesQ.isPending;
  const error = profileQ.isError ? profileQ.error : sourcesQ.isError ? sourcesQ.error : null;

  const saveProfile = (): void => {
    save.mutate(
      { name, about, audience },
      {
        onSuccess: () => onFeedback("Описание сохранено"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  };

  if (loading) {
    return (
      <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Загрузка хранилища">
        <Header />
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <Header />
        <ErrorState message={error.message} onRetry={() => { void profileQ.refetch(); void sourcesQ.refetch(); }} />
      </div>
    );
  }

  const sources = sourcesQ.data ?? [];

  return (
    <div className="min-w-0 space-y-6">
      <Header />

      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="storage-feedback">
          {feedback.text}
        </p>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <div className="section-label mb-3">Описание компании</div>
            <div className="space-y-3">
              <Field label="Название компании" value={name} onChange={setName} id="profile-name" testId="storage-name" />
              <Field label="Чем занимаетесь" value={about} onChange={setAbout} id="profile-about" rows={3} testId="storage-about" />
              <Field label="Аудитория и предложения" value={audience} onChange={setAudience} id="profile-audience" rows={2} testId="storage-audience" />
            </div>
            <Button variant="secondary" size="sm" className="mt-4" onClick={saveProfile} disabled={save.isPending} data-testid="storage-save">
              Сохранить описание
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="section-label mb-3">Дополнительно</div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">Искать в интернете</div>
                <div className="text-xs text-muted-foreground">При отсутствии ответа в базе</div>
              </div>
              <Switch checked={webSearch} onCheckedChange={setWebSearch} label="Искать в интернете" testId="storage-websearch" />
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Globe className="size-3.5" aria-hidden />
              ИИ подмешивает веб-результаты с пометкой источника
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="min-w-0" aria-label="Источники знаний">
        <h2 className="section-label mb-2">Источники знаний</h2>
        <Card>
          <CardContent>
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm" data-testid="storage-table">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Источник</th>
                    <th className="py-2 pr-3 font-medium">Тип</th>
                    <th className="py-2 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => {
                    const st = sourceTypeOf(s.type);
                    const Icon = SOURCE_ICON[st];
                    const tone = sourceStatusTone(s.status);
                    return (
                      <tr key={s.id} className="border-b border-border last:border-b-0" data-testid="storage-row" data-source={s.id}>
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                            {s.name}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-data text-xs uppercase text-muted-foreground">{SOURCE_TYPE_LABEL[st]}</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="text-[11px]">
                            {tone === "status" ? <span className="size-1.5 rounded-full bg-status" aria-hidden /> : null}
                            {s.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Header() {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Хранилище и база знаний</h1>
      <p className="mt-1 text-sm text-muted-foreground">Описание компании и источники знаний</p>
    </header>
  );
}

function Field({ label, value, onChange, id, rows, testId }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  rows?: number;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      {rows ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          maxLength={2000}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          data-testid={testId}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={300}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring")}
          data-testid={testId}
        />
      )}
    </div>
  );
}
