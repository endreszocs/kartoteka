'use client'

import { Search } from 'lucide-react'

interface MuhelySearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function MuhelySearchBar({ value, onChange, placeholder = 'Keresés...' }: MuhelySearchBarProps) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#788075]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-[#d8cbb8] bg-[#fffdf7] py-3 pl-11 pr-4 text-sm text-[#26382f] shadow-[inset_0_1px_3px_rgba(77,64,45,0.04)] outline-none transition placeholder:text-[#8b8f86] hover:border-[#b9ad99] focus:border-[#8a9a74] focus:ring-4 focus:ring-[#647a52]/10 motion-reduce:transition-none"
      />
    </label>
  )
}
