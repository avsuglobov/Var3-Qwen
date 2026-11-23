"use client";

import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/schemas";

/**
 * Вкладка «Правила согласования»: что ИИ делает сам, что согласует человек.
 * Режим помечен точкой и текстом (не только цветом); сотрудник из мастера не имеет правил — это честно пишется.
 */
export function AgentApprovalsCard({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-4">
      <h3 className="section-label">Что ИИ делает сам, что согласует</h3>
      {agent.approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Правила не заданы: у сотрудника, созданного в мастере, пока нет правил согласования.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm" data-testid="agent-approvals">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="py-2 pr-4 font-medium">Действие</th>
                <th scope="col" className="py-2 pr-4 font-medium">Режим</th>
                <th scope="col" className="py-2 font-medium">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {agent.approvals.map((r) => (
                <tr key={r.action} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4">{r.action}</td>
                  <td className="py-2.5 pr-4">
                    <Badge>
                      {r.mode === "auto" ? (
                        <>
                          <span className="size-1.5 rounded-full bg-status" aria-hidden />
                          Сам
                        </>
                      ) : (
                        <>
                          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                          Согласует
                        </>
                      )}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
