"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import type { Agent, CompanyProfile, Conversation, Document, Lead, OnboardingStep, Task } from "@/lib/schemas";

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
  channels: ["channels"] as const,
  tasks: ["tasks"] as const,
  calendarEvents: ["calendarEvents"] as const,
  knowledgeSources: ["knowledgeSources"] as const,
  chainTemplates: ["chainTemplates"] as const,
  supplyRequests: ["supplyRequests"] as const,
  supplyOffers: ["supplyOffers"] as const,
  quizzes: ["quizzes"] as const,
  companyProfile: ["companyProfile"] as const,
  courses: ["courses"] as const,
  certificates: ["certificates"] as const
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
export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: () => getApi().tasks.list() });
export const useCalendarEvents = () => useQuery({ queryKey: qk.calendarEvents, queryFn: () => getApi().calendarEvents.list() });
export const useKnowledgeSources = () => useQuery({ queryKey: qk.knowledgeSources, queryFn: () => getApi().reference.knowledgeSources() });
export const useChainTemplates = () => useQuery({ queryKey: qk.chainTemplates, queryFn: () => getApi().reference.chainTemplates() });
export const useSupplyRequests = () => useQuery({ queryKey: qk.supplyRequests, queryFn: () => getApi().reference.supplyRequests() });
export const useSupplyOffers = () => useQuery({ queryKey: qk.supplyOffers, queryFn: () => getApi().reference.supplyOffers() });
export const useQuizzes = () => useQuery({ queryKey: qk.quizzes, queryFn: () => getApi().reference.quizzes() });
export const useCompanyProfile = () => useQuery({ queryKey: qk.companyProfile, queryFn: () => getApi().companyProfile.get() });
export const useCourses = () => useQuery({ queryKey: qk.courses, queryFn: () => getApi().courses.list() });
export const useCertificates = () => useQuery({ queryKey: qk.certificates, queryFn: () => getApi().certificates.list() });

/** Завершение курса выдачей сертификата: курсы и список сертификатов обновляются после подтверждения адаптером. */
export function useCompleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, name, score }: { courseId: string; name: string; score: number }) =>
      getApi().courses.complete(courseId, { name, score }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.courses });
      qc.invalidateQueries({ queryKey: qk.certificates });
    }
  });
}

/** Сохранение описания компании в «Хранилище». */
export function useSaveCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CompanyProfile>) => getApi().companyProfile.update(patch),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.companyProfile })
  });
}

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

/** Изменение диалога (режим ИИ/менеджер, новое сообщение): оптимистичное обновление с откатом при ошибке. */
export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Conversation> }) => getApi().conversations.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.conversations });
      const prev = qc.getQueryData<Conversation[]>(qk.conversations);
      qc.setQueryData<Conversation[]>(qk.conversations, (list) => list?.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.conversations, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.conversations })
  });
}

/** Создание лида в CRM: запись появляется в списке после подтверждения адаптером. */
export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lead: Lead) => getApi().leads.create(lead),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.leads })
  });
}

/** Импорт лидов из файла: пакетное создание, список обновляется после подтверждения адаптером. */
export function useCreateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leads: Lead[]) => getApi().leads.createMany(leads),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.leads })
  });
}

/** Перемещение лида на стадию (канбан, инспектор): оптимистичное обновление с откатом при ошибке. */
export function useMoveLeadStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Lead> }) => getApi().leads.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.leads });
      const prev = qc.getQueryData<Lead[]>(qk.leads);
      qc.setQueryData<Lead[]>(qk.leads, (list) => list?.map((l) => (l.id === id ? { ...l, ...patch, id: l.id } : l)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.leads, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.leads })
  });
}

/** Удаление лида (после подтверждения): список обновляется после подтверждения адаптером. */
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().leads.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.leads })
  });
}

/** Создание документа: запись появляется в очереди после подтверждения адаптером. */
export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: Document) => getApi().documents.create(doc),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents })
  });
}

/** Согласование документа (одобрить/отклонить): оптимистичное обновление с откатом при ошибке. */
export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Document> }) => getApi().documents.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.documents });
      const prev = qc.getQueryData<Document[]>(qk.documents);
      qc.setQueryData<Document[]>(qk.documents, (list) => list?.map((d) => (d.id === id ? { ...d, ...patch, id: d.id } : d)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.documents, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents })
  });
}

/** Удаление документа: список обновляется после подтверждения адаптером. */
export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().documents.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.documents })
  });
}

/** Создание задачи: запись появляется в списке после подтверждения адаптером. */
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => getApi().tasks.create(task),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks })
  });
}

/** Готово/вернуть в работу: оптимистичное обновление с откатом при ошибке. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => getApi().tasks.update(id, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const prev = qc.getQueryData<Task[]>(qk.tasks);
      qc.setQueryData<Task[]>(qk.tasks, (list) => list?.map((t) => (t.id === id ? { ...t, done } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.tasks, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks })
  });
}

/** Правка задачи (приоритет перетаскиванием на доске): оптимистичное обновление с откатом. */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) => getApi().tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const prev = qc.getQueryData<Task[]>(qk.tasks);
      qc.setQueryData<Task[]>(qk.tasks, (list) => list?.map((t) => (t.id === id ? { ...t, ...patch, id: t.id } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.tasks, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks })
  });
}

/** Удаление задачи: список обновляется после подтверждения адаптером. */
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getApi().tasks.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tasks })
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
