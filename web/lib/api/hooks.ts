"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import type { OnboardingStep } from "@/lib/schemas";

/** Ключи запросов. Все данные приходят через интерфейс Api (localStorage сейчас, REST потом). */
export const qk = {
  leads: ["leads"] as const,
  documents: ["documents"] as const,
  conversations: ["conversations"] as const,
  onboarding: ["onboarding"] as const,
  agents: ["agents"] as const,
  notifications: ["notifications"] as const,
  activity: ["activity"] as const
};

export const useLeads = () => useQuery({ queryKey: qk.leads, queryFn: () => getApi().leads.list() });
export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: () => getApi().documents.list() });
export const useConversations = () => useQuery({ queryKey: qk.conversations, queryFn: () => getApi().conversations.list() });
export const useOnboarding = () => useQuery({ queryKey: qk.onboarding, queryFn: () => getApi().onboarding.list() });
export const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => getApi().agents.list() });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => getApi().notifications.list() });
export const useActivity = () => useQuery({ queryKey: qk.activity, queryFn: () => getApi().reference.activity() });

/** Отметка шага онбординга: оптимистичное обновление с откатом при ошибке. */
export function useToggleOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => getApi().onboarding.update(id, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: qk.onboarding });
      const prev = qc.getQueryData<OnboardingStep[]>(qk.onboarding);
      qc.setQueryData<OnboardingStep[]>(qk.onboarding, (steps) => steps?.map((s) => (s.id === id ? { ...s, done } : s)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.onboarding, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.onboarding })
  });
}

/** Данные верхней панели: «в сети / всего» агентов и число непрочитанных уведомлений (undefined, пока грузится). */
export function useShellStats() {
  const agents = useAgents();
  const notifications = useNotifications();
  return {
    agentsOnline: agents.data?.filter((a) => a.status === "online").length,
    agentsTotal: agents.data?.length,
    unread: notifications.data?.filter((n) => !n.read).length
  };
}
