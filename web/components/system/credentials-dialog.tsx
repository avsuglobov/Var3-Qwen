"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAmocrmAuthorize, useCredentials, useSaveCredentials } from "@/lib/api/hooks";
import type { Integration } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const LABEL = "mt-3 block text-xs font-medium text-muted-foreground";

/**
 * Диалог «Ключи» (этап 8): ручной ввод конфигурации внешнего сервиса. Секретные поля
 * вводятся как пароль; с сервера приходит только маска (последние 4 знака), полное значение
 * в браузер не возвращается. Хранение — .data/secrets.json на сервере, вне снимка данных.
 * Этап 11: для amoCRM здесь же кнопка «Войти через amoCRM» — первичная выдача токена по коду
 * авторизации (активна после сохранения clientId и секретного ключа; колбэк сохраняет токены).
 * Родитель рендерит диалог с key={integration.id} — при смене интеграции форма чистая.
 */
export function CredentialsDialog({
  open,
  onOpenChange,
  integration,
  onSaved
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  integration: Integration;
  onSaved?: (name: string) => void;
}) {
  const creds = useCredentials(open ? integration.id : null);
  const save = useSaveCredentials();
  const authorize = useAmocrmAuthorize();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [oauthNote, setOauthNote] = useState<string | null>(null);
  // Этап 11: первичная выдача токена amoCRM по коду авторизации — только для int-amocrm.
  const isAmocrm = integration.id === "int-amocrm";
  const [callbackUri, setCallbackUri] = useState<string | null>(null);

  // Несекретные сохранённые значения подставляются как черновик; секретные всегда пустые
  // (маска показывается рядом с полем, полное значение с сервера не приходит).
  useEffect(() => {
    const data = creds.data;
    if (!data) return;
    setFields((prev) => {
      const next = { ...prev };
      for (const f of data.fields) if (next[f.key] === undefined) next[f.key] = f.plain ?? "";
      return next;
    });
  }, [creds.data]);

  // Адрес колбэка известен только в браузере — подставляется после открытия диалога.
  useEffect(() => {
    if (open && isAmocrm) setCallbackUri(`${window.location.origin}/api/integrations/amocrm/callback`);
  }, [open, isAmocrm]);

  // Кнопка входа активна, только если clientId (несекретное поле) и секретный ключ уже
  // сохранены на сервере: обмен кода на токен происходит после ухода со страницы,
  // набранные, но не сохранённые значения в тот момент недоступны.
  const savedClientId = (creds.data?.fields.find((f) => f.key === "clientId")?.plain ?? "").trim();
  const savedClientSecret = Boolean(creds.data?.fields.find((f) => f.key === "clientSecret")?.masked);

  const close = (): void => {
    setFields({});
    setError(null);
    setSavedNote(false);
    setOauthNote(null);
    onOpenChange(false);
  };

  const submit = (): void => {
    const payload: Record<string, string> = {};
    for (const f of creds.data?.fields ?? []) payload[f.key] = (fields[f.key] ?? "").trim();
    save.mutate(
      { integrationId: integration.id, fields: payload },
      {
        onSuccess: () => {
          setError(null);
          setSavedNote(true);
          // Набранные секреты не остаются в полях: форма очищается, маска придёт с сервера.
          setFields({});
          onSaved?.(integration.name);
        },
        onError: (e) => {
          setSavedNote(false);
          setError(e.message);
        }
      }
    );
  };

  const startOauth = (): void => {
    setOauthNote(null);
    setError(null);
    authorize.mutate(undefined, {
      onSuccess: (data) => {
        window.open(data.authorizeUrl, "_blank", "noopener");
        setOauthNote("Открыта страница amoCRM — подтвердите доступ: код вернётся в приложение, токены сохранятся автоматически.");
      },
      onError: (e) => setError(`Не удалось начать вход: ${e.message}`)
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md" data-testid="integrations-keys-dialog" aria-describedby={undefined}>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          Ключи — {integration.name}
        </DialogTitle>
        <DialogDescription className="text-xs">
          Ключи хранятся на сервере (.data/secrets.json) и не отдаются в браузер целиком: у секретных
          полей видна только маска. Запросы к внешнему сервису выполняет сервер приложения.
        </DialogDescription>

        {(creds.data?.fields ?? []).map((f) => (
          <div key={f.key}>
            <label className={LABEL} htmlFor={`cred-${f.key}`}>
              {f.label}
              {f.masked ? <span className="ml-2 font-normal text-muted-foreground">сохранено: {f.masked}</span> : null}
            </label>
            <input
              id={`cred-${f.key}`}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              className={FIELD}
              value={fields[f.key] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.hint ?? ""}
              data-testid="integrations-key-input"
              data-field={f.key}
              aria-label={`${f.label} — ${integration.name}`}
            />
            {f.hint ? <p className="mt-1 text-[11px] text-muted-foreground">{f.hint}</p> : null}
          </div>
        ))}

        {isAmocrm ? (
          <div className="mt-3 rounded-sm border border-input p-3" data-testid="integrations-oauth-block">
            <p className="text-[11px] text-muted-foreground">
              Первичная выдача токена по коду авторизации: в настройках интеграции amoCRM укажите redirect URI{" "}
              <code className="break-all">{callbackUri ?? "…"}</code>
            </p>
            <Button variant="secondary" className="mt-2" onClick={startOauth} disabled={!savedClientId || !savedClientSecret || authorize.isPending} data-testid="integrations-oauth-login">
              Войти через amoCRM
            </Button>
            {!savedClientId || !savedClientSecret ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Кнопка активна после сохранения clientId и секретного ключа.</p>
            ) : null}
            {oauthNote ? (
              <p role="status" aria-live="polite" className="mt-2 text-[13px]" data-testid="integrations-oauth-note">
                {oauthNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {savedNote ? (
          <p role="status" aria-live="polite" className="mt-2 text-[13px]" data-testid="integrations-keys-saved">
            Ключи сохранены.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-destructive" data-testid="integrations-keys-error">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} data-testid="integrations-keys-cancel">
            Закрыть
          </Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="integrations-keys-save">
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
