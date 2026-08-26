"use client";

import Link from "next/link";
import { resolveThemeColors } from "@/lib/public-site/theme-presets";
import { usePathname } from "next/navigation";
import type { PublicSiteData } from "@/lib/public-site/site-loader";
import { PublicCrest } from "./public-crest";
import { PublicMobileNav } from "./public-mobile-nav";

function normalizePathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function isActivePath(pathname: string, href: string, isHome = false): boolean {
  const currentPath = normalizePathname(pathname);
  if (isHome) return currentPath === href;
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function PublicSiteHeader({
  site,
  memberPortalEnabled = false,
}: {
  site: PublicSiteData;
  memberPortalEnabled?: boolean;
}) {
  const pathname = usePathname();
  const resolvedColors = resolveThemeColors(
    site.theme,
    site.custom_primary_color,
    site.custom_accent_color,
  );
  const navItems = [
    { href: `/gy/${site.slug}`, label: "Kezdőlap", isHome: true },
    // 2026-08-27: az „Alkalmaink" eddig csak horgony volt a kezdőlapon
    // (`#alkalmak`); most saját oldal, éves naptárral és letöltéssel.
    { href: `/gy/${site.slug}/alkalmak`, label: "Alkalmaink" },
    { href: `/gy/${site.slug}/posts`, label: "Hírek" },
    { href: `/gy/${site.slug}/magazin`, label: "Magazin" },
    { href: `/gy/${site.slug}/rolunk`, label: "Rólunk" },
    ...(memberPortalEnabled
      ? [{ href: `/gy/${site.slug}/tagi-portal`, label: "Tagi portál" }]
      : []),
  ];

  return (
    <header
      className="public-site-header sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--public-surface) 88%, transparent)",
        borderColor: "var(--public-line)",
      }}
    >
      <div className="public-container flex items-center justify-between gap-4 py-2.5 sm:py-3.5">
        {/* 2026-08-10: címer + EGYSOROS wordmark. A régi „serif név + apró
            tagline" kettős a mobilon két sorba tört és zsúfolt volt. */}
        <Link
          href={`/gy/${site.slug}`}
          className="group flex min-h-11 min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-accent-ink)] focus-visible:ring-offset-2"
          aria-label={`${site.display_name} kezdőlapja`}
        >
          <PublicCrest
            src={site.crest_image_url}
            name={site.display_name}
            size={44}
            shape="shield"
            className="transition-transform group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none"
          />
          <span
            className="min-w-0 truncate text-[1.06rem] leading-tight sm:text-[1.32rem]"
            style={{
              color: "var(--public-ink)",
              fontFamily: "var(--public-heading-font)",
              letterSpacing: "-0.01em",
            }}
          >
            {site.display_name}
          </span>
        </Link>

        <nav
          aria-label="Fő navigáció"
          className="hidden shrink-0 items-center gap-1 text-sm lg:flex"
        >
          {navItems.map((item) => {
            const isActive = isActivePath(pathname, item.href, item.isHome);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="relative inline-flex min-h-11 items-center px-3.5 py-2 font-medium transition-colors hover:[color:var(--public-accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-accent-ink)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                style={{
                  color: isActive
                    ? "var(--public-accent-ink)"
                    : "var(--public-ink)",
                  // Az aktív oldalt arany hajszálvonal jelzi a pirula helyett.
                  boxShadow: isActive
                    ? "inset 0 -2px 0 0 var(--public-accent)"
                    : undefined,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <PublicMobileNav
          slug={site.slug}
          displayName={site.display_name}
          crestImageUrl={site.crest_image_url}
          primaryColor={resolvedColors.primary}
          primaryOnSurfaceColor={resolvedColors.primaryOnSurface}
          inkColor={resolvedColors.ink}
          memberPortalEnabled={memberPortalEnabled}
        />
      </div>
    </header>
  );
}
