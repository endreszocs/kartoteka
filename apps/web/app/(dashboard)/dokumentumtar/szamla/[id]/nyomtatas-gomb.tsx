'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Nyomtatás-gomb a számla-adatlaphoz — a lap @media print CSS-e gondoskodik
 *  róla, hogy csak maga a lap kerüljön papírra. */
export function SzamlaNyomtatasGomb() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="mr-1.5 size-4" aria-hidden />
      Nyomtatás
    </Button>
  )
}
