'use client'

import { Search } from 'lucide-react'

interface MuhelySearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function MuhelySearchBar({ value, onChange, placeholder = 'Keresés...' }: MuhelySearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 transition-all"
      />
    </div>
  )
}
