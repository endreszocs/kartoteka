// A (public) route group root layout-ja. Minimálisan csak pass-through —
// a tényleges layout a gy/[slug]/layout.tsx-ben van, mert az szükséges
// a gyülekezet-specifikus téma betöltéshez.

export default function PublicRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
