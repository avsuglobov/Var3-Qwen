"use client";

import { Globe, Mail, MessageCircle, Phone, Send, type LucideIcon } from "lucide-react";
import type { Channel } from "@/lib/schemas";

/** Иконки каналов по справочнику прототипа (монохромные lucide, stroke — как во всём интерфейсе). */
export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  "send-paper-plane": Send,
  "message-circle": MessageCircle,
  globe: Globe,
  mail: Mail,
  phone: Phone
};

/** Иконка без рамки-чипа (для кнопок выбора каналов в мастере). */
export function ChannelGlyph({ name }: { name: string }) {
  const Icon = CHANNEL_ICONS[name];
  return Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null;
}

/** Чип канала: иконка + название. Неизвестное имя иконки (битые данные) — без значка, но с подписью. */
export function ChannelChip({ channel }: { channel: Channel }) {
  const Icon = CHANNEL_ICONS[channel.icon];
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-border bg-card px-2.5 text-xs font-medium text-foreground" title={channel.name}>
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {channel.name}
    </span>
  );
}
