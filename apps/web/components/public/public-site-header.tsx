"use client";

import Link from "next/link";
import Image from "next/image";
import { shouldBypassPublicImageOptimization } from "@/lib/public-site/public-image";
import { resolveThemeColors } from "@/lib/public-site/theme-presets";
import { usePathname } from "next/navigation";
import type { PublicSiteData } from "@/lib/public-site/site-loader";
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
          "color-mix(in srgb, var(--public-surface) 85%, transparent)",
        borderColor: "color-mix(in srgb, var(--public-ink) 8%, transparent)",
      }}
    >
      <div className="public-container flex items-center justify-between gap-4 py-3 sm:py-4">
        <Link
          href={`/gy/${site.slug}`}
          className="group flex min-h-11 min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-primary-on-surface)] focus-visible:ring-offset-2"
          aria-label={`${site.display_name} kezdőlapja`}
        >
          {site.crest_image_url ? (
            <Image
              src={site.crest_image_url}
              alt=""
              width={48}
              height={48}
              sizes="(min-width: 640px) 48px, 44px"
              unoptimized={shouldBypassPublicImageOptimization(
                site.crest_image_url,
              )}
              className="h-11 w-11 shrink-0 rounded-xl object-cover transition-transform group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none sm:h-12 sm:w-12"
            />
          ) : (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-lg transition-transform group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none sm:h-12 sm:w-12 sm:text-xl"
              style={{
                background:
                  "linear-gradient(135deg, var(--public-primary), color-mix(in srgb, var(--public-primary) 70%, var(--public-accent-strong)))",
              }}
              aria-hidden="true"
            >
              {site.display_name.charAt(0)}
            </span>
          )}
          <span className="min-w-0">
            <span
              className="block truncate font-serif text-xl leading-[1.05] sm:text-[1.6rem]"
              style={{ color: "var(--public-ink)" }}
            >
              {site.display_name}
            </span>
            {site.tagline && (
              <span
                className="mt-0.5 hidden truncate text-xs sm:block sm:text-[0.78rem]"
                style={{ color: "var(--public-muted)" }}
              >
                {site.tagline}
              </span>
            )}
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
                className="inline-flex min-h-11 items-center rounded-full px-4 py-2 font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--public-primary)_8%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--public-primary-on-surface)] focus-visible:ring-offset-2 motion-reduce:transition-none"
                style={{
                  color: isActive
                    ? "var(--public-primary-on-surface)"
                    : "var(--public-ink)",
                  backgroundColor: isActive
                    ? "color-mix(in srgb, var(--public-primary) 10%, transparent)"
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
