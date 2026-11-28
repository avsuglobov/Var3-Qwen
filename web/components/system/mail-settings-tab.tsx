"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCreateMailAccount,
  useDeleteMailAccount,
  useMailAccounts,
  useSaveMailSettings,
  useTestMailAccount,
  useUpdateMailAccount,
  type MailAccountView,
  type MailTestResult
} from "@/lib/api/hooks";

/**
 * Вкладка «Почта» в Настройках (этап 21): учётные записи IMAP/SMTP (пароли — только маской,
 * пустое поле = «оставить сохранённый»), интервал фонового опроса (дефолт 2 минуты — решение
 * этапа 21), «Проверить соединение» с честным результатом по IMAP и SMTP, последняя ошибка
 * опроса. Изменения доступны администратору; на сервере маршруты проверяют роль сами.
 */

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

interface AccountForm {
  name: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  user: string;
  pass: string;
  from: string;
  folders: string;
}

const EMPTY_FORM: AccountForm = {
  name: "",
  imapHost: "",
  imapPort: "993",
  imapSecure: true,
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  user: "",
  pass: "",
  from: "",
  folders: ""
};

function formOf(account: MailAccountView): AccountForm {
  return {
    name: account.name,
    imapHost: account.imapHost,
    imapPort: String(account.imapPort),
    imapSecure: account.imapSecure,
    smtpHost: account.smtpHost,
    smtpPort: String(account.smtpPort),
    smtpSecure: account.smtpSecure,
    user: account.user,
    pass: "", // пусто = «оставить сохранённый пароль»
    from: account.from,
    folders: account.folders.filter((f) => f !== "INBOX").join(", ")
  };
}

export function MailSettingsTab() {
  const accountsQ = useMailAccounts();
  const createAccount = useCreateMailAccount();
  const updateAccount = useUpdateMailAccount();
  const deleteAccount = useDeleteMailAccount();
  const testAccount = useTestMailAccount();
  const saveSettings = useSaveMailSettings();
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [intervalSec, setIntervalSec] = useState<string>("120");
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });
  const [testResult, setTestResult] = useState<Record<string, MailTestResult>>({});

  if (accountsQ.isPending) {
    return <p className="text-[13px] text-muted-foreground" aria-busy="true">Загрузка почтовых аккаунтов…</p>;
  }
  if (accountsQ.isError) {
    return <p role="alert" className="text-[13px] text-destructive">{accountsQ.error?.message ?? "Не удалось загрузить почтовые аккаунты"}</p>;
  }
  const state = accountsQ.data;
  const intervalValue = intervalSec === "120" && !form.name ? String(state.pollIntervalSec) : intervalSec;

  const payload = (): Record<string, unknown> => ({
    name: form.name.trim(),
    imapHost: form.imapHost.trim(),
    imapPort: Number(form.imapPort),
    imapSecure: form.imapSecure,
    smtpHost: form.smtpHost.trim(),
    smtpPort: Number(form.smtpPort),
    smtpSecure: form.smtpSecure,
    user: form.user.trim(),
    pass: form.pass,
    from: form.from.trim(),
    folders: form.folders.split(",").map((f) => f.trim()).filter(Boolean)
  });

  const submit = (): void => {
    setFeedback({ text: editingId ? "Сохранение аккаунта…" : "Добавление аккаунта…", kind: "status" });
    const onError = (e: Error): void => setFeedback({ text: e.message, kind: "alert" });
    if (editingId) {
      updateAccount.mutate(
        { id: editingId, patch: payload() },
        { onSuccess: () => { setFeedback({ text: "Аккаунт сохранён", kind: "status" }); setForm(EMPTY_FORM); setEditingId(null); }, onError }
      );
    } else {
      createAccount.mutate(
        payload(),
        { onSuccess: () => { setFeedback({ text: "Аккаунт добавлен", kind: "status" }); setForm(EMPTY_FORM); }, onError }
      );
    }
  };

  const startEdit = (account: MailAccountView): void => {
    setEditingId(account.id);
    setForm(formOf(account));
    setFeedback({ text: `Правка «${account.name}» — пароль пуст, останется прежний`, kind: "status" });
  };

  const runTest = (account: MailAccountView): void => {
    setFeedback({ text: `Проверка «${account.name}»…`, kind: "status" });
    testAccount.mutate(account.id, {
      onSuccess: (res) => {
        setTestResult((prev) => ({ ...prev, [account.id]: res }));
        setFeedback({ text: res.ok ? "Соединение проверено — IMAP и SMTP работают" : "Проверка завершена с ошибками — см. детали под аккаунтом", kind: res.ok ? "status" : "alert" });
      },
      onError: (e) => setFeedback({ text: e.message, kind: "alert" })
    });
  };

  const remove = (account: MailAccountView): void => {
    deleteAccount.mutate(account.id, {
      onSuccess: () => setFeedback({ text: "Аккаунт удалён", kind: "status" }),
      onError: (e) => setFeedback({ text: e.message, kind: "alert" })
    });
  };

  const saveInterval = (): void => {
    saveSettings.mutate(
      { pollIntervalSec: Number(intervalValue) || state.pollIntervalSec },
      {
        onSuccess: () => setFeedback({ text: `Интервал опроса сохранён: ${intervalValue} с`, kind: "status" }),
        onError: (e) => setFeedback({ text: e.message, kind: "alert" })
      }
    );
  };

  return (
    <div className="space-y-3.5">
      {state.accounts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Учётных записей нет — добавьте первую: IMAP для входящих писем, SMTP для ответов.</p>
      ) : (
        <ul className="space-y-2" data-testid="settings-mail-accounts">
          {state.accounts.map((a) => (
            <li key={a.id} className="rounded-sm border border-border p-2.5 text-[13px]" data-testid="settings-mail-account">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{a.name} · {a.user}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    IMAP {a.imapHost}:{a.imapPort} ({a.imapSecure ? "TLS" : "STARTTLS"}) · SMTP {a.smtpHost}:{a.smtpPort} · пароль {a.passMask} · папки: {a.folders.join(", ")}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" data-testid={`settings-mail-test-${a.id}`} onClick={() => runTest(a)} disabled={testAccount.isPending}>Проверить соединение</Button>
                  <Button size="sm" variant="secondary" data-testid={`settings-mail-edit-${a.id}`} onClick={() => startEdit(a)}>Править</Button>
                  <Button size="sm" variant="secondary" data-testid={`settings-mail-delete-${a.id}`} onClick={() => remove(a)} disabled={deleteAccount.isPending}>Удалить</Button>
                </div>
              </div>
              {state.lastError[a.id] ? (
                <p role="alert" className="mt-1.5 text-[11.5px] text-destructive">Ошибка опроса: {state.lastError[a.id].message}</p>
              ) : null}
              {testResult[a.id] ? (
                <p className={testResult[a.id].ok ? "mt-1.5 text-[11.5px] text-muted-foreground" : "mt-1.5 text-[11.5px] text-destructive"} data-testid={`settings-mail-test-result-${a.id}`}>
                  IMAP: {testResult[a.id].imap.message}. SMTP: {testResult[a.id].smtp.message}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t pt-3">
        <div className="section-label">{editingId ? "Правка учётной записи" : "Новая учётная запись"}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={FIELD} type="text" placeholder="Название (Продажи)" aria-label="Название аккаунта" value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="settings-mail-name" />
          <input className={FIELD} type="text" placeholder="Логин ящика (sales@example.com)" aria-label="Логин ящика" value={form.user}
            onChange={(e) => setForm((p) => ({ ...p, user: e.target.value }))} data-testid="settings-mail-user" />
          <input className={FIELD} type="password" autoComplete="new-password" placeholder={editingId ? "Пароль (пусто — не менять)" : "Пароль ящика"} aria-label="Пароль ящика" value={form.pass}
            onChange={(e) => setForm((p) => ({ ...p, pass: e.target.value }))} data-testid="settings-mail-pass" />
          <input className={FIELD} type="text" placeholder="Адрес отправителя (по умолчанию — логин)" aria-label="Адрес отправителя" value={form.from}
            onChange={(e) => setForm((p) => ({ ...p, from: e.target.value }))} data-testid="settings-mail-from" />
          <input className={FIELD} type="text" placeholder="IMAP-сервер (imap.example.com)" aria-label="IMAP-сервер" value={form.imapHost}
            onChange={(e) => setForm((p) => ({ ...p, imapHost: e.target.value }))} data-testid="settings-mail-imap-host" />
          <input className={FIELD} type="text" inputMode="numeric" placeholder="IMAP-порт (993)" aria-label="IMAP-порт" value={form.imapPort}
            onChange={(e) => setForm((p) => ({ ...p, imapPort: e.target.value }))} data-testid="settings-mail-imap-port" />
          <input className={FIELD} type="text" placeholder="SMTP-сервер (smtp.example.com)" aria-label="SMTP-сервер" value={form.smtpHost}
            onChange={(e) => setForm((p) => ({ ...p, smtpHost: e.target.value }))} data-testid="settings-mail-smtp-host" />
          <input className={FIELD} type="text" inputMode="numeric" placeholder="SMTP-порт (587)" aria-label="SMTP-порт" value={form.smtpPort}
            onChange={(e) => setForm((p) => ({ ...p, smtpPort: e.target.value }))} data-testid="settings-mail-smtp-port" />
          <input className={FIELD} type="text" placeholder="Папки через запятую (INBOX входит всегда)" aria-label="Папки IMAP" value={form.folders}
            onChange={(e) => setForm((p) => ({ ...p, folders: e.target.value }))} data-testid="settings-mail-folders" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          IMAP secure (неявный TLS, порт 993)
          <input type="checkbox" data-testid="settings-mail-imap-secure" checked={form.imapSecure} onChange={(e) => setForm((p) => ({ ...p, imapSecure: e.target.checked }))} />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          SMTP secure (STARTTLS; порт 465 — неявный TLS)
          <input type="checkbox" data-testid="settings-mail-smtp-secure" checked={form.smtpSecure} onChange={(e) => setForm((p) => ({ ...p, smtpSecure: e.target.checked }))} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" data-testid="settings-mail-save" onClick={submit} disabled={createAccount.isPending || updateAccount.isPending}>
            {editingId ? "Сохранить аккаунт" : "Добавить аккаунт"}
          </Button>
          {editingId ? (
            <Button size="sm" variant="secondary" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Отмена</Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="section-label">Фоновый опрос</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${FIELD} w-28`} type="text" inputMode="numeric" aria-label="Интервал опроса, секунд" value={intervalValue}
            onChange={(e) => setIntervalSec(e.target.value)} data-testid="settings-mail-interval" />
          <span className="text-[12.5px] text-muted-foreground">секунд (от 30 до 3600; дефолт 120 — 2 минуты)</span>
          <Button size="sm" variant="secondary" data-testid="settings-mail-interval-save" onClick={saveInterval} disabled={saveSettings.isPending}>Сохранить интервал</Button>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          Первый запуск ставит курсоры папок на текущие UID — история ящика в CRM не заливается. Имена папок — латиница (без UTF-7).
        </p>
      </div>

      {feedback.text && (
        <p role={feedback.kind === "alert" ? "alert" : "status"} className={feedback.kind === "alert" ? "text-[11.5px] text-destructive" : "text-[11.5px] text-muted-foreground"} data-testid="settings-mail-feedback">
          {feedback.text}
        </p>
      )}
    </div>
  );
}
