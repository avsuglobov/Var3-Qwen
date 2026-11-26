"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAuthError, useAuthStatus, useLoginPin, useSetupPin } from "@/lib/api/hooks";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Экран защиты (этап 15): закрывает приложение, пока API требует вход. Два режима —
 * первичное задание PIN (PIN ещё не задан) и разблокировка по PIN. Показывается по
 * открытому маршруту /api/auth/status, а также мгновенно при 401 от любого запроса
 * данных (сессия истекла во время работы) — подписка на кэш TanStack Query.
 * PIN не задаётся здесь повторно: повторный setup сервер отклоняет (409).
 */
export function AuthGate() {
  const qc = useQueryClient();
  const status = useAuthStatus();
  const [forced, setForced] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const setup = useSetupPin();
  const login = useLoginPin();

  // 401 «Требуется вход…» от любого запроса данных — приложение заблокировано прямо сейчас.
  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((ev) => {
      if (ev.query.state.status === "error" && isAuthError(ev.query.state.error)) setForced(true);
    });
    return unsub;
  }, [qc]);

  // Статус refreshed после успешного входа — сбрасываем принудительную блокировку.
  useEffect(() => {
    if (status.data?.unlocked) setForced(false);
  }, [status.data?.unlocked]);

  const locked = forced || (status.isSuccess && !status.data.unlocked);
  if (!locked) return null;

  const mode = status.data?.setup === false ? "setup" : "login";
  const busy = setup.isPending || login.isPending;
  const error = setup.error ?? login.error;

  const submit = (): void => {
    if (mode === "setup") setup.mutate({ pin, pin2 }, { onSuccess: () => { setPin(""); setPin2(""); } });
    else login.mutate({ pin }, { onSuccess: () => setPin("") });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4" data-testid="auth-gate">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">{mode === "setup" ? "Защита приложения — задайте PIN" : "Приложение заблокировано"}</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "setup"
              ? "PIN от 4 до 12 знаков закрывает все данные и ключи интеграций. Хэш хранится только на сервере (.data/secrets.json), сессия — 30 дней."
              : "Введите PIN, заданный при первом входе. Сессия после разблокировки живёт 30 дней."}
          </p>
          <input
            className={FIELD}
            type="password"
            autoComplete={mode === "setup" ? "new-password" : "current-password"}
            placeholder={mode === "setup" ? "Новый PIN" : "PIN"}
            aria-label={mode === "setup" ? "Новый PIN" : "PIN"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
            data-testid="auth-pin"
          />
          {mode === "setup" ? (
            <input
              className={FIELD}
              type="password"
              autoComplete="new-password"
              placeholder="Повторите PIN"
              aria-label="Повторите PIN"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
              data-testid="auth-pin-repeat"
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] text-critical" data-testid="auth-error">
              {error.message}
            </p>
          ) : null}
          <Button className="w-full" disabled={busy || pin.length < 4 || (mode === "setup" && pin2.length < 4)} onClick={submit} data-testid="auth-submit">
            {busy ? "Проверяем…" : mode === "setup" ? "Сохранить PIN и войти" : "Разблокировать"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
