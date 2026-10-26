import { DollarSign } from 'lucide-react';

/** A small dollar bill in the restaurant's gold coin colours. */
export function DollarBill() {
  return <span aria-hidden="true" className="relative inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-[5px] border border-[#FFF3B8] bg-gold text-abyss shadow-[0_2px_0_#0B0A2480]">
    <span className="absolute left-1 size-0.5 rounded-full bg-abyss/50" /><DollarSign size={16} strokeWidth={2.5} /><span className="absolute right-1 size-0.5 rounded-full bg-abyss/50" />
  </span>;
}
