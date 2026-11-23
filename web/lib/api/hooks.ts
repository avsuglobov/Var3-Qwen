"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import type { Agent, OnboardingStep } from "@/lib/schemas";

/** Ключи запросов. Все данные приходят через интерфейс Api (localStorage сейчас, REST потом). */
export const qk = {
  leads: ["leads"] as const,
  documents: ["documents"] as const,
  conversations: ["conversations"] as const,
  onboarding: ["onboarding"] as const,
  agents: ["agents"] as const,
  notifications: ["notifications"] as const,
  activity: ["activity"] as const,
  funnels: ["funnels"] as const,
  stages: ["stages"] as const,
  channels: ["channels"] as const
};

export const useLeads = () => useQuery({ queryKey: qk.leads, queryFn: () => getApi().leads.list() });
export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: () => getApi().documents.list() });
export const useConversations = () => useQuery({ queryKey: qk.conversations, queryFn: () => getApi().conversations.list() });
export const useOnboarding = () => useQuery({ queryKey: qk.onboarding, queryFn: () => getApi().onboarding.list() });
export const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => getApi().agents.list() });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => getApi().notifications.list() });
export const useActivity = () => useQuery({ queryKey: qk.activity, queryFn: () => getApi().reference.activity() });
export const useFunnels = () => useQuery({ queryKey: qk.funnels, queryFn: () => getApi().reference.funnels() });
export const useStages = () => useQuery({ queryKey: qk.stages, queryFn: () => getApi().reference.stages() });
export const useChannels = () => useQuery({ queryKey: qk.channels, queryFn: () => getApi().reference.channels() });

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

/** Изменение сотрудника (инструкция, пауза): оптимистичное обновление с откатом при ошибке; id не меняется. */
export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Agent> }) => getApi().agents.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.agents });
      const prev = qc.getQueryData<Agent[]>(qk.agents);
      qc.setQueryData<Agent[]>(qk.agents, (list) => list?.map((a) => (a.id === id ? { ...a, ...patch, id: a.id } : a)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.agents, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.agents })
  });
}

/** Создание сотрудника в мастере: запись появляется в списке после подтверждения адаптером. */
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agent: Agent) => getApi().agents.create(agent),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.agents })
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
