"use client";

import { AlertTriangle, Clock, Download, RefreshCw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuthStatus, useBootstrapAdmin, useChannels, useCompanyProfile, useCreateUser, useDeleteUser, useExportData, useImportData, useLogout, usePatchUser, useResetData, useSaveCompanyProfile, useUsers } from "@/lib/api/hooks";
import type { PublicUser } from "@/lib/api/hooks";
import {
  DEFAULT_SETTINGS_TAB,
  DEFAULT_TARIFF,
  NOTIFICATION_TOGGLES,
  ROLE_ACCESS,
  SETTINGS_DEFAULTS,
  SETTINGS_TABS,
  TARIFFS,
  importFeedback
} from "@/lib/selectors/system";
import { cn } from "@/lib/utils";
import type { CompanyProfile } from "@/lib/schemas";

const FIELD = "h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Раздел «Настройки» (этап 3, финальная группа) — поведение settings() прототипа:
 * 7 вкладок (состояние клиента, как AIWS.store.settingsTab), роли и каналы, переключатели
 * «Уведомлений» (в сессии, как AIWS.store.switches), вкладка «Данные» с работающими
 * экспортом/импортом/сбросом через слой Api. Этап 7: смена тарифа сохраняется в профиле
 * компании; поля профиля и компании — демо-значения без сохранения (как fieldRow прототипа).
 * Этап 15: во вкладке «Профиль» кнопка «Заблокировать» завершает сессию — приложение
 * закрывается экраном входа. Этап 18: во вкладке «Роли» — управление учётными записями
 * (создание первого администратора, список, роли admin/manager/viewer, удаление).
 */
export function SettingsView() {
  const [tab, setTab] = useState(DEFAULT_SETTINGS_TAB);
  const channelsQ = useChannels();
  const profileQ = useCompanyProfile();

  return (
    <div className="min-w-0 space-y-6">
      <Header />

      <div className="flex flex-wrap gap-1.5" data-testid="settings-tabs" role="group" aria-label="Разделы настроек">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex h-8 items-center rounded-chip border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            data-testid={`settings-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="max-w-[640px]">
        <CardContent>{tab === "profile" ? <ProfileTab /> : tab === "company" ? <CompanyTab /> : tab === "roles" ? <RolesTab /> : tab === "channels" ? <ChannelsTab channelsQ={channelsQ} /> : tab === "notifications" ? <NotificationsTab /> : tab === "tariff" ? <TariffTab profileQ={profileQ} /> : <DataTab />}</CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Профиль */

function ProfileTab() {
  const [name, setName] = useState<string>(SETTINGS_DEFAULTS.profileName);
  const [email, setEmail] = useState<string>(SETTINGS_DEFAULTS.profileEmail);
  const [tz, setTz] = useState<string>(SETTINGS_DEFAULTS.profileTz);
  const logout = useLogout();
  return (
    <div className="space-y-3">
      <Field label="Имя" value={name} onChange={setName} id="settings-name" testId="settings-field-name" />
      <Field label="Email" value={email} onChange={setEmail} id="settings-email" testId="settings-field-email" />
      <Field label="Часовой пояс" value={tz} onChange={setTz} id="settings-tz" testId="settings-field-tz" />
      <p className="text-[11.5px] text-muted-foreground">Сохранение профиля появится вместе с реальным бэкендом (в прототипе — «скоро»).</p>
      {/* Этап 15→18: завершить сессию — приложение закрывается экраном входа. */}
      <div className="flex items-center justify-between gap-3 rounded-sm border border-input p-3" data-testid="settings-lock">
        <div className="min-w-0">
          <p className="text-sm font-medium">Защита приложения</p>
          <p className="text-xs text-muted-foreground">Завершить сессию на этом устройстве — до входа по логину и паролю приложение закрыто.</p>
        </div>
        <Button variant="secondary" size="sm" disabled={logout.isPending} onClick={() => logout.mutate()} data-testid="settings-lock-button">
          Заблокировать
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Компания */

function CompanyTab() {
  const [name, setName] = useState<string>(SETTINGS_DEFAULTS.companyName);
  const [site, setSite] = useState<string>(SETTINGS_DEFAULTS.companySite);
  const [about, setAbout] = useState<string>(SETTINGS_DEFAULTS.companyAbout);
  return (
    <div className="space-y-3">
      <Field label="Название" value={name} onChange={setName} id="settings-company-name" testId="settings-company-name" />
      <Field label="Сайт" value={site} onChange={setSite} id="settings-company-site" testId="settings-company-site" />
      <div className="space-y-1.5">
        <label htmlFor="settings-company-about" className="text-[13px] font-medium text-muted-foreground">
          О компании
        </label>
        <textarea
          id="settings-company-about"
          value={about}
          rows={3}
          maxLength={2000}
          onChange={(e) => setAbout(e.target.value)}
          className="w-full rounded-sm border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="settings-company-about"
        />
      </div>
      <p className="text-[11.5px] text-muted-foreground">Контекст для AI-сотрудников редактируется в разделе «Хранилище и база знаний».</p>
    </div>
  );
}

/* --------------------------------------------------------------- Роли */

function RolesTab() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0">
        <div className="section-label mb-3">Роли и доступ</div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm" data-testid="settings-roles">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Роль</th>
                <th className="py-2 font-medium">Доступ</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ACCESS.map((r) => (
                <tr key={r.role} className="border-b border-border last:border-b-0" data-testid="settings-role-row" data-role={r.role}>
                  <td className="py-2.5 pr-3">{r.role}</td>
                  <td className="py-2.5 text-muted-foreground">{r.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <SecurityCard />
    </div>
  );
}

/* ------------------------------------------------------ Пользователи (этап 18) */

/**
 * Управление учётными записями (этап 18): пока пользователей нет — создание первого
 * администратора (при миграции с PIN-установки нужен действующий PIN, после чего PIN
 * отключается); у админа — список пользователей, смена роли/пароля, удаление; прочим
 * ролям видна только их собственная роль. Сессия — 7 дней, lockout — 5 попыток/15 минут.
 */
function SecurityCard() {
  const status = useAuthStatus();
  const mode = status.data?.mode;
  const isAdmin = mode === "open" || status.data?.user?.role === "admin";
  const usersQ = useUsers();
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  return (
    <div className="min-w-0" data-testid="settings-security">
      <div className="section-label mb-3">Пользователи и вход</div>
      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="mb-3 text-[13px]" data-testid="settings-users-feedback">
          {feedback.text}
        </p>
      ) : null}
      {mode === "users" && status.data?.user ? (
        <p className="mb-3 text-[13px] text-muted-foreground" data-testid="settings-current-user">
          Вы вошли как <b>{status.data.user.login}</b> — роль {status.data.user.role}.
        </p>
      ) : null}
      {mode === "open" || mode === "pin" ? <BootstrapForm onFeedback={(t, k) => setFeedback({ text: t, kind: k })} pinMode={mode === "pin"} /> : null}
      {isAdmin && mode === "users" ? <UsersAdmin onFeedback={(t, k) => setFeedback({ text: t, kind: k })} /> : null}
      {usersQ.isError && isAdmin ? (
        <p role="alert" className="text-[13px] text-destructive">{usersQ.error?.message}</p>
      ) : null}
    </div>
  );
}

/** Создание первого администратора: с PIN (миграция) или без (свежая установка). */
function BootstrapForm({ onFeedback, pinMode }: { onFeedback: (t: string, k: "status" | "alert") => void; pinMode: boolean }) {
  const bootstrap = useBootstrapAdmin();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pin, setPin] = useState("");
  const busy = bootstrap.isPending;
  const submit = (): void =>
    bootstrap.mutate(
      pinMode ? { login, password, password2, pin } : { login, password, password2 },
      {
        onSuccess: () => onFeedback(`Администратор ${login} создан — вход теперь по логину и паролю`, "status"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );
  return (
    <div className="space-y-3 rounded-sm border border-input p-3" data-testid="settings-bootstrap">
      <p className="text-[13.5px] font-medium">{pinMode ? "Создайте первого администратора" : "Включить вход по учётным записям"}</p>
      {pinMode ? (
        <input className={FIELD} type="password" placeholder="Действующий PIN" aria-label="Действующий PIN" value={pin} onChange={(e) => setPin(e.target.value)} data-testid="settings-bootstrap-pin" />
      ) : null}
      <input className={FIELD} type="text" autoComplete="username" placeholder="Логин администратора" aria-label="Логин администратора" value={login} onChange={(e) => setLogin(e.target.value)} data-testid="settings-bootstrap-login" />
      <input className={FIELD} type="password" autoComplete="new-password" placeholder="Пароль (от 10 знаков, с цифрой)" aria-label="Пароль администратора" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="settings-bootstrap-password" />
      <input className={FIELD} type="password" autoComplete="new-password" placeholder="Повторите пароль" aria-label="Повторите пароль" value={password2} onChange={(e) => setPassword2(e.target.value)} data-testid="settings-bootstrap-password2" />
      <Button size="sm" disabled={busy || !login || password.length < 10 || password2 !== password || (pinMode && !pin)} onClick={submit} data-testid="settings-bootstrap-submit">
        {busy ? "Создаём…" : "Создать администратора"}
      </Button>
      <p className="text-[11.5px] text-muted-foreground">
        {pinMode
          ? "Верный PIN подтверждает право настроить вход; после создания администратора PIN отключается совсем."
          : "Пароль от 10 знаков с хотя бы одной цифрой; хранится только scrypt-хэш (.data/secrets.json)."}
      </p>
    </div>
  );
}

/** Список пользователей админом: смена роли, пароля, удаление; форма создания. */
function UsersAdmin({ onFeedback }: { onFeedback: (t: string, k: "status" | "alert") => void }) {
  const usersQ = useUsers();
  const create = useCreateUser();
  const patch = usePatchUser();
  const del = useDeleteUser();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [role, setRole] = useState("viewer");

  const onCreate = (): void =>
    create.mutate(
      { login, password, password2, role },
      {
        onSuccess: (u) => { onFeedback(`Пользователь ${u.login} создан (роль ${u.role})`, "status"); setLogin(""); setPassword(""); setPassword2(""); setRole("viewer"); },
        onError: (e) => onFeedback(e.message, "alert")
      }
    );

  const onRole = (u: PublicUser, next: string): void =>
    patch.mutate(
      { id: u.id, role: next },
      {
        onSuccess: (r) => onFeedback(`Роль ${r.login} изменена на ${r.role}; его сессии завершены`, "status"),
        onError: (e) => onFeedback(e.message, "alert")
      }
    );

  const onDelete = (u: PublicUser): void =>
    del.mutate(u.id, {
      onSuccess: () => onFeedback(`Пользователь ${u.login} удалён`, "status"),
      onError: (e) => onFeedback(e.message, "alert")
    });

  return (
    <div className="space-y-4">
      <div className="min-w-0 overflow-x-auto" data-testid="settings-users-list">
        {(usersQ.data?.users ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0" data-testid="settings-user-row" data-login={u.login}>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{u.login}</div>
              <div className="text-xs text-muted-foreground">{u.role}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Роль: ${u.login}`}
                value={u.role}
                onChange={(e) => onRole(u, e.target.value)}
                className="h-8 rounded-sm border border-input bg-card px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
                data-testid="settings-user-role"
              >
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="viewer">viewer</option>
              </select>
              <Button variant="ghost" size="sm" disabled={del.isPending} onClick={() => onDelete(u)} data-testid="settings-user-delete">
                Удалить
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-sm border border-input p-3" data-testid="settings-user-create">
        <p className="text-[13.5px] font-medium">Новый пользователь</p>
        <input className={FIELD} type="text" placeholder="Логин" aria-label="Логин нового пользователя" value={login} onChange={(e) => setLogin(e.target.value)} data-testid="settings-user-login" />
        <input className={FIELD} type="password" autoComplete="new-password" placeholder="Пароль (от 10 знаков, с цифрой)" aria-label="Пароль нового пользователя" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="settings-user-password" />
        <input className={FIELD} type="password" autoComplete="new-password" placeholder="Повторите пароль" aria-label="Повторите пароль нового пользователя" value={password2} onChange={(e) => setPassword2(e.target.value)} data-testid="settings-user-password2" />
        <select aria-label="Роль нового пользователя" value={role} onChange={(e) => setRole(e.target.value)} className={FIELD} data-testid="settings-user-role-new">
          <option value="admin">admin</option>
          <option value="manager">manager</option>
          <option value="viewer">viewer</option>
        </select>
        <Button size="sm" disabled={create.isPending || !login || password.length < 10 || password2 !== password} onClick={onCreate} data-testid="settings-user-create-button">
          {create.isPending ? "Создаём…" : "Создать пользователя"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Каналы */

function ChannelsTab({ channelsQ }: { channelsQ: { data?: { id: string; name: string }[] | undefined } }) {
  return (
    <div className="min-w-0">
      <div className="section-label mb-3">Подключённые каналы</div>
      <div className="flex flex-wrap gap-2" data-testid="settings-channels">
        {(channelsQ.data ?? []).map((c, i) => (
          <span
            key={c.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-xs",
              i < 3 ? "border-accent bg-accent-soft text-accent" : "border-border bg-card text-muted-foreground"
            )}
            data-testid="settings-channel-chip"
            data-channel={c.id}
          >
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Уведомления */

function NotificationsTab() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_TOGGLES.map((t) => [t.key, t.def]))
  );
  return (
    <div className="space-y-3.5">
      {NOTIFICATION_TOGGLES.map((t, i) => (
        <div key={t.key} className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-[13.5px] font-medium">{t.key}</div>
          <Switch
            checked={toggles[t.key] ?? t.def}
            onCheckedChange={(next) => setToggles((prev) => ({ ...prev, [t.key]: next }))}
            label={`Уведомление: ${t.key}`}
            testId={`settings-sw-${i}`}
          />
        </div>
      ))}
      <p className="text-[11.5px] text-muted-foreground">Настройки действуют до конца сессии (демо).</p>
    </div>
  );
}

/* -------------------------------------------------------------- Тариф */

/**
 * Вкладка «Тариф» (этап 7): выбор тарифа и сохранение в профиле компании
 * (companyProfile.update). Названия без цен; биллинг — внешний сервис, в демо не подключён.
 */
function TariffTab({ profileQ }: { profileQ: { data?: CompanyProfile; isPending: boolean; isError: boolean; error: Error | null } }) {
  const save = useSaveCompanyProfile();
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });

  if (profileQ.isPending) {
    return (
      <p className="text-[13px] text-muted-foreground" aria-busy="true">
        Загрузка тарифа…
      </p>
    );
  }
  if (profileQ.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {profileQ.error?.message ?? "Не удалось загрузить профиль"}
      </p>
    );
  }

  const current = picked ?? profileQ.data?.tariff ?? DEFAULT_TARIFF;
  const changed = current !== (profileQ.data?.tariff ?? DEFAULT_TARIFF);

  const submit = (): void =>
    save.mutate(
      { tariff: current },
      {
        onSuccess: () => setFeedback({ text: `Тариф сохранён: ${current}`, kind: "status" }),
        onError: (e) => setFeedback({ text: e.message, kind: "alert" })
      }
    );

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold" data-testid="settings-tariff-name">
        Тариф: {current}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="settings-tariff-select" className="text-[13px] font-medium text-muted-foreground">
          Выбранный тариф
        </label>
        <select
          id="settings-tariff-select"
          value={current}
          onChange={(e) => { setPicked(e.target.value); setFeedback({ text: "", kind: "status" }); }}
          className="h-9 w-full rounded-sm border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="settings-tariff-select"
        >
          {TARIFFS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={submit} disabled={save.isPending || !changed} data-testid="settings-tariff-save">
        Сохранить тариф
      </Button>
      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="text-[13px]" data-testid="settings-tariff-feedback">
          {feedback.text}
        </p>
      ) : null}
      <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        Цены не показываются (демо). Смена тарифа сохраняется в данных приложения; биллинг — внешний сервис, в демо не подключён.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- Данные */

function DataTab() {
  const exportData = useExportData();
  const importData = useImportData();
  const resetData = useResetData();
  const [feedback, setFeedback] = useState<{ text: string; kind: "status" | "alert" }>({ text: "", kind: "status" });
  const fileRef = useRef<HTMLInputElement>(null);

  const onFeedback = (text: string, kind: "status" | "alert" = "status"): void => setFeedback({ text, kind });

  const onExport = (): void =>
    exportData.mutate(undefined, {
      onSuccess: (json) => {
        downloadJSON(json);
        onFeedback("Файл данных скачан");
      },
      onError: (e) => onFeedback(e.message, "alert")
    });

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const text = await file.text();
    importData.mutate(text, {
      onSuccess: (r) => onFeedback(importFeedback(r.dropped)),
      onError: (e) => onFeedback(e.message, "alert")
    });
  };

  const onReset = (): void =>
    resetData.mutate(undefined, {
      onSuccess: () => onFeedback("Данные сброшены к демо"),
      onError: (e) => onFeedback(e.message, "alert")
    });

  return (
    <div className="min-w-0">
      <div className="section-label mb-3">Данные приложения</div>
      {feedback.text ? (
        <p role={feedback.kind} aria-live="polite" className="mb-3 text-[13px]" data-testid="settings-data-feedback">
          {feedback.text}
        </p>
      ) : null}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">Экспорт в JSON</div>
            <div className="text-xs text-muted-foreground">Лиды, диалоги, документы, онбординг</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onExport} disabled={exportData.isPending} data-testid="settings-export">
            <Download className="size-4" aria-hidden />
            Экспорт
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">Импорт из JSON</div>
            <div className="text-xs text-muted-foreground">Заменить текущие данные файлом</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={importData.isPending} data-testid="settings-import">
            <Upload className="size-4" aria-hidden />
            Импорт
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              try { e.target.value = ""; } catch { /* сброс выбора файла */ }
            }}
            data-testid="settings-import-input"
            aria-hidden
            tabIndex={-1}
          />
        </div>
        <div className="border-t border-border" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">Сбросить к демо</div>
            <div className="text-xs text-muted-foreground">Вернуть исходные фикстуры</div>
          </div>
          <Button variant="destructive" size="sm" onClick={onReset} disabled={resetData.isPending} data-testid="settings-reset">
            <RefreshCw className="size-4" aria-hidden />
            Сбросить
          </Button>
        </div>
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden />
          Данные хранятся на сервере приложения (.data/db.json), формат файла совместим с прототипом.
        </p>
      </div>
    </div>
  );
}

/** Скачивание снимка данных — как exportJSON прототипа (db.js): Blob + ai-workspace-data.json. */
function downloadJSON(json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-workspace-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ------------------------------------------------------------ общее */

function Field({ label, value, onChange, id, testId }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        data-testid={testId}
      />
    </div>
  );
}

function Header() {
  return (
    <header className="min-w-0">
      <h1 className="text-[28px] leading-tight">Настройки</h1>
      <p className="mt-1 text-sm text-muted-foreground">Профиль, компания, роли, каналы, уведомления, тариф</p>
    </header>
  );
}
