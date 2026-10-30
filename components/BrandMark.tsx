import Link from 'next/link';
import { Compass } from 'lucide-react';

interface BrandMarkProps {
  href?: string;
}

export default function BrandMark({ href = '/' }: BrandMarkProps) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-[#171622] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171622] rounded-md"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171622] text-[#C8F27C] transition-transform duration-150 group-hover:scale-105"
      >
        <Compass className="h-4 w-4 stroke-[2.2]" />
      </span>
      <span className="font-display">LifeCraft</span>
    </Link>
  );
}
