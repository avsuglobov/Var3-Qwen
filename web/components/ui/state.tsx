import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Состояние «ошибка»: понятный текст и кнопка «Повторить». Критичный цвет — только у иконки, текст обычный. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-critical" aria-hidden />
        <span className="text-sm font-medium">Не удалось загрузить данные</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button size="sm" onClick={onRetry}>
        Повторить
      </Button>
    </div>
  );
}

/** Состояние «пусто»: что это значит и что делать дальше. */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-start gap-1 p-5 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Inbox className="size-4 text-muted-foreground" aria-hidden />
        {title}
      </div>
      <p className="text-muted-foreground">{hint}</p>
    </div>
  );
}
