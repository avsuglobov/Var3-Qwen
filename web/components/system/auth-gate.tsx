"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAuthError, useAuthStatus, useLogin } from "@/lib/api/hooks";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Экран входа (этап 18): закрывает приложение, пока API требует вход. Два режима — вход по
 * логину и паролю (пользователи созданы) и миграционный вход по PIN (установка этапов 15–17,
 * первый администратор ещё не создан — после входа он заводится в Настройках → Пользователи).
 * Показывается по открытому маршруту /api/auth/status, а также мгновенно при 401 от любого
 * запроса данных (сессия истекла во время работы) — подписка на кэш TanStack Query.
 * Открытый режим (mode «open», блока auth нет) — гейт не показывается: так живут демо и e2e.
 */
export function AuthGate() {
  const qc = useQueryClient();
  const status = useAuthStatus();
  const [forced, setForced] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const doLogin = useLogin();

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

  const mode = status.data?.mode === "open" ? "open" : forced || (status.isSuccess && !status.data.unlocked) ? (status.data?.mode === "pin" ? "pin" : "login") : "open";
  if (mode === "open") return null;

  const busy = doLogin.isPending;
  const error = doLogin.error;

  const submit = (): void => {
    if (mode === "pin") doLogin.mutate({ pin }, { onSuccess: () => setPin("") });
    else doLogin.mutate({ login, password }, { onSuccess: () => { setLogin(""); setPassword(""); } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4" data-testid="auth-gate">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-3 p-5">
          <h2 className="text-lg font-semibold">{mode === "pin" ? "Вход по PIN" : "Приложение закрыто"}</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "pin"
              ? "Приложение ещё защищено PIN-кодом (миграция на учётные записи). Введите PIN, затем создайте администратора в Настройках → Пользователи."
              : "Введите логин и пароль. Сессия после входа живёт 7 дней; после 5 неудачных попыток вход блокируется на 15 минут."}
          </p>
          {mode === "pin" ? (
            <input
              className={FIELD}
              type="password"
              autoComplete="current-password"
              placeholder="PIN"
              aria-label="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
              data-testid="auth-pin"
            />
          ) : (
            <>
              <input
                className={FIELD}
                type="text"
                autoComplete="username"
                placeholder="Логин"
                aria-label="Логин"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                data-testid="auth-login"
              />
              <input
                className={FIELD}
                type="password"
                autoComplete="current-password"
                placeholder="Пароль"
                aria-label="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
                data-testid="auth-password"
              />
            </>
          )}
          {error ? (
            <p role="alert" className="text-[13px] text-critical" data-testid="auth-error">
              {error.message}
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={busy || (mode === "pin" ? pin.length < 4 : login.length === 0 || password.length === 0)}
            onClick={submit}
            data-testid="auth-submit"
          >
            {busy ? "Проверяем…" : "Войти"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
