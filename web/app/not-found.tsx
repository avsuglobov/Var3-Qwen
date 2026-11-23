import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-[28px]">Страница не найдена</h1>
      <p className="text-sm text-muted-foreground">Такого раздела нет. Вернитесь к обзору.</p>
      <Button asChild variant="default">
        <Link href="/overview">К обзору</Link>
      </Button>
    </main>
  );
}
