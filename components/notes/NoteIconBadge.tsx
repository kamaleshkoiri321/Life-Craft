'use client';

import React from 'react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  Code2,
  Dumbbell,
  Leaf,
  Mountain,
  Sparkles,
} from 'lucide-react';
import type {
  NoteColorOption,
  NoteIconStyle,
} from '@/lib/notes/note-utils';

export const NOTE_ICON_CONFIG: Record<
  NoteIconStyle,
  {
    label: string;
    bgClass: string;
    iconClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  leaf: {
    label: 'Habits & Growth',
    bgClass: 'bg-[#E5F6D3]',
    iconClass: 'text-[#2D6A23]',
    Icon: Leaf,
  },
  code: {
    label: 'Code & Tech',
    bgClass: 'bg-[#EBE8F8]',
    iconClass: 'text-[#5938B5]',
    Icon: Code2,
  },
  mountain: {
    label: 'Travel & Life',
    bgClass: 'bg-[#FDECEC]',
    iconClass: 'text-[#C4322B]',
    Icon: Mountain,
  },
  chart: {
    label: 'Planning & Finance',
    bgClass: 'bg-[#E6F4F9]',
    iconClass: 'text-[#1E6D8C]',
    Icon: BarChart3,
  },
  book: {
    label: 'Reading & Study',
    bgClass: 'bg-[#EEE9FD]',
    iconClass: 'text-[#5938B5]',
    Icon: BookOpen,
  },
  dumbbell: {
    label: 'Health & Fitness',
    bgClass: 'bg-[#FCECE9]',
    iconClass: 'text-[#C83E2B]',
    Icon: Dumbbell,
  },
  sparkles: {
    label: 'Ideas & Creative',
    bgClass: 'bg-[#FDF4E3]',
    iconClass: 'text-[#B36B12]',
    Icon: Sparkles,
  },
  journal: {
    label: 'Daily Journal',
    bgClass: 'bg-[#E8F3FC]',
    iconClass: 'text-[#1D5F91]',
    Icon: Calendar,
  },
};

export const NOTE_COLOR_STYLES: Record<
  NoteColorOption,
  {
    label: string;
    chipClass: string;
    dotClass: string;
    folderTextClass: string;
    activeRingClass: string;
  }
> = {
  lime: {
    label: 'Soft Lime',
    chipClass: 'bg-[#E6F6D2] text-[#2B611D]',
    dotClass: 'bg-[#65B339]',
    folderTextClass: 'text-[#3B7A23]',
    activeRingClass: 'ring-[#65B339]',
  },
  violet: {
    label: 'Lavender',
    chipClass: 'bg-[#EBE8F8] text-[#4C2FA3]',
    dotClass: 'bg-[#7C5CE6]',
    folderTextClass: 'text-[#5938B5]',
    activeRingClass: 'ring-[#7C5CE6]',
  },
  emerald: {
    label: 'Mint',
    chipClass: 'bg-[#DFF4EC] text-[#1D6B52]',
    dotClass: 'bg-[#289672]',
    folderTextClass: 'text-[#1D6B52]',
    activeRingClass: 'ring-[#289672]',
  },
  amber: {
    label: 'Warm Peach',
    chipClass: 'bg-[#FDF0DF] text-[#9A5311]',
    dotClass: 'bg-[#E0822B]',
    folderTextClass: 'text-[#9A5311]',
    activeRingClass: 'ring-[#E0822B]',
  },
  rose: {
    label: 'Soft Coral',
    chipClass: 'bg-[#FCE8E8] text-[#A82525]',
    dotClass: 'bg-[#D94848]',
    folderTextClass: 'text-[#A82525]',
    activeRingClass: 'ring-[#D94848]',
  },
  sky: {
    label: 'Sky Blue',
    chipClass: 'bg-[#E5F2FC] text-[#1C5D8C]',
    dotClass: 'bg-[#3688C4]',
    folderTextClass: 'text-[#1C5D8C]',
    activeRingClass: 'ring-[#3688C4]',
  },
  slate: {
    label: 'Warm Slate',
    chipClass: 'bg-[#ECECEF] text-[#353446]',
    dotClass: 'bg-[#646378]',
    folderTextClass: 'text-[#353446]',
    activeRingClass: 'ring-[#646378]',
  },
};

export default function NoteIconBadge({
  iconStyle,
  size = 'md',
}: {
  iconStyle: NoteIconStyle;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cfg = NOTE_ICON_CONFIG[iconStyle] ?? NOTE_ICON_CONFIG.leaf;
  const Icon = cfg.Icon;
  const sizeClasses =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : size === 'lg'
        ? 'h-11 w-11 rounded-xl'
        : 'h-10 w-10 rounded-xl';
  const iconSize =
    size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-4.5 w-4.5';

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center ${sizeClasses} ${cfg.bgClass} ${cfg.iconClass}`}
    >
      <Icon className={iconSize} />
    </div>
  );
}
