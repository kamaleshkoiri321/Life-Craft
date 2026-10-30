'use client';

import React from 'react';
import type {
  LibraryCollectionColor,
  LibraryCoverStyle,
} from '@/lib/library/library-utils';

export function getCollectionColorClasses(color: LibraryCollectionColor): {
  folderText: string;
  folderBg: string;
  chipBg: string;
  chipText: string;
  dotBg: string;
} {
  switch (color) {
    case 'rose':
      return {
        folderText: 'text-[#D64072]',
        folderBg: 'bg-[#FDF0F5]',
        chipBg: 'bg-[#FDF0F5]',
        chipText: 'text-[#B82E5D]',
        dotBg: 'bg-[#D64072]',
      };
    case 'emerald':
      return {
        folderText: 'text-[#2E8555]',
        folderBg: 'bg-[#EAF8F0]',
        chipBg: 'bg-[#EAF8F0]',
        chipText: 'text-[#236B43]',
        dotBg: 'bg-[#2E8555]',
      };
    case 'sky':
      return {
        folderText: 'text-[#2563EB]',
        folderBg: 'bg-[#EDF5FF]',
        chipBg: 'bg-[#EDF5FF]',
        chipText: 'text-[#1D4ED8]',
        dotBg: 'bg-[#2563EB]',
      };
    case 'amber':
      return {
        folderText: 'text-[#C2781A]',
        folderBg: 'bg-[#FFF6E5]',
        chipBg: 'bg-[#FFF6E5]',
        chipText: 'text-[#9C5D0F]',
        dotBg: 'bg-[#D98A26]',
      };
    case 'indigo':
      return {
        folderText: 'text-[#4F46E5]',
        folderBg: 'bg-[#EEF0FF]',
        chipBg: 'bg-[#EEF0FF]',
        chipText: 'text-[#3730A3]',
        dotBg: 'bg-[#4F46E5]',
      };
    case 'slate':
      return {
        folderText: 'text-[#475569]',
        folderBg: 'bg-[#F1F5F9]',
        chipBg: 'bg-[#F1F5F9]',
        chipText: 'text-[#334155]',
        dotBg: 'bg-[#475569]',
      };
    case 'violet':
    default:
      return {
        folderText: 'text-[#6E48D6]',
        folderBg: 'bg-[#F3EFFE]',
        chipBg: 'bg-[#F3EFFE]',
        chipText: 'text-[#5532B8]',
        dotBg: 'bg-[#6E48D6]',
      };
  }
}

interface BookCoverArtProps {
  title: string;
  coverStyle: LibraryCoverStyle;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export default function BookCoverArt({
  title,
  coverStyle,
  size = 'md',
  className = '',
}: BookCoverArtProps) {
  const initials =
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'BK';

  const sizeClasses =
    size === 'xs'
      ? 'h-11 w-9 rounded-lg'
      : size === 'sm'
        ? 'h-20 w-15 rounded-xl'
        : size === 'lg'
          ? 'h-36 w-26 rounded-2xl'
          : 'h-32 w-22 rounded-xl';

  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden border border-[#171622]/10 shadow-xs select-none ${sizeClasses} ${className}`}
    >
      {/* Book spine highlight */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1.5 bg-gradient-to-r from-black/20 via-white/15 to-transparent" />

      {coverStyle === 'forest' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-forest" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1B2A26" />
              <stop offset="55%" stopColor="#2F4B3C" />
              <stop offset="100%" stopColor="#14201C" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-forest)" />
          <path
            d="M0 95 Q42 75 84 98 T120 92 L120 168 L0 168 Z"
            fill="#8AB96B"
            fillOpacity="0.45"
          />
          <path
            d="M0 118 Q55 96 120 122 L120 168 L0 168 Z"
            fill="#47704C"
            fillOpacity="0.75"
          />
          <path
            d="M0 140 Q48 128 120 146 L120 168 L0 168 Z"
            fill="#1D3328"
          />
        </svg>
      )}

      {coverStyle === 'sunset' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-sunset" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F5A67E" />
              <stop offset="55%" stopColor="#E67E6E" />
              <stop offset="100%" stopColor="#423652" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-sunset)" />
          <circle cx="78" cy="54" r="16" fill="#FFE6B8" fillOpacity="0.85" />
          <path
            d="M0 112 L38 82 L76 110 L120 76 L120 168 L0 168 Z"
            fill="#6D4F69"
            fillOpacity="0.7"
          />
          <path
            d="M0 132 L48 104 L92 130 L120 114 L120 168 L0 168 Z"
            fill="#322840"
          />
        </svg>
      )}

      {coverStyle === 'ocean' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-ocean" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9ED2C6" />
              <stop offset="50%" stopColor="#7297B8" />
              <stop offset="100%" stopColor="#2F3E5C" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-ocean)" />
          <circle cx="82" cy="44" r="11" fill="#FFF2CC" fillOpacity="0.85" />
          <path
            d="M0 105 L44 74 L88 106 L120 84 L120 168 L0 168 Z"
            fill="#56698F"
            fillOpacity="0.75"
          />
          <path
            d="M0 132 Q60 112 120 134 L120 168 L0 168 Z"
            fill="#293552"
          />
        </svg>
      )}

      {coverStyle === 'lavender' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-lavender" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#E5DDF7" />
              <stop offset="55%" stopColor="#B8A9E8" />
              <stop offset="100%" stopColor="#6D5CAE" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-lavender)" />
          <circle cx="28" cy="46" r="36" fill="#8975C9" fillOpacity="0.45" />
          <circle cx="96" cy="108" r="44" fill="#52438C" fillOpacity="0.55" />
          <path
            d="M0 128 Q60 102 120 130 L120 168 L0 168 Z"
            fill="#3B2E6B"
            fillOpacity="0.65"
          />
        </svg>
      )}

      {coverStyle === 'midnight' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-midnight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14233C" />
              <stop offset="60%" stopColor="#1D3557" />
              <stop offset="100%" stopColor="#0D1829" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-midnight)" />
          <circle cx="80" cy="48" r="14" fill="#E8F1F5" fillOpacity="0.88" />
          <circle cx="28" cy="34" r="1.5" fill="#FFFFFF" fillOpacity="0.7" />
          <circle cx="48" cy="62" r="1.2" fill="#FFFFFF" fillOpacity="0.5" />
          <path
            d="M0 116 Q50 96 120 118 L120 168 L0 168 Z"
            fill="#27466E"
            fillOpacity="0.7"
          />
          <path
            d="M0 138 Q65 124 120 142 L120 168 L0 168 Z"
            fill="#0F1E33"
          />
        </svg>
      )}

      {coverStyle === 'meadow' && (
        <svg
          viewBox="0 0 120 168"
          className="h-full w-full object-cover"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="cov-meadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#CFE0BC" />
              <stop offset="60%" stopColor="#9AB882" />
              <stop offset="100%" stopColor="#466942" />
            </linearGradient>
          </defs>
          <rect width="120" height="168" fill="url(#cov-meadow)" />
          <path
            d="M60 168 L60 44"
            stroke="#264025"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse
            cx="44"
            cy="78"
            rx="16"
            ry="8"
            transform="rotate(-28 44 78)"
            fill="#2E4F2B"
          />
          <ellipse
            cx="76"
            cy="68"
            rx="16"
            ry="8"
            transform="rotate(28 76 68)"
            fill="#2E4F2B"
          />
          <ellipse
            cx="44"
            cy="108"
            rx="18"
            ry="9"
            transform="rotate(-24 44 108)"
            fill="#264025"
          />
          <ellipse
            cx="76"
            cy="98"
            rx="18"
            ry="9"
            transform="rotate(24 76 98)"
            fill="#264025"
          />
        </svg>
      )}

      {/* Subtle monogram badge in top-left corner */}
      {size !== 'xs' && (
        <div className="absolute top-2 left-2.5 z-10 rounded-md bg-black/25 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/90 backdrop-blur-[1px]">
          {initials}
        </div>
      )}
    </div>
  );
}
