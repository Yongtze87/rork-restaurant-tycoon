import { DollarSign } from 'lucide-react';

/** A small dollar bill in the restaurant's teal and gold palette. */
export function DollarBill() {
  return <span aria-hidden="true" className="relative inline-flex h-5 w-7 shrink-0 items-center justify-center rounded-[5px] border border-gold bg-teal text-gold shadow-[0_2px_0_#233D3B40]">
    <span className="absolute left-1 size-0.5 rounded-full bg-gold/65" /><DollarSign size={16} strokeWidth={2.5} /><span className="absolute right-1 size-0.5 rounded-full bg-gold/65" />
  </span>;
}
