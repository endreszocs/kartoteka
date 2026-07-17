import Link from "next/link";
import { Calendar, ArrowUpRight } from "lucide-react";
import type { PublicPostListItem } from "@/lib/public-site/site-loader";
import { getPublicVisualTheme } from "@/lib/public-site/visual-theme-registry";
import Image from "next/image";
import { shouldBypassPublicImageOptimization } from "@/lib/public-site/public-image";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function PublicPostCard({
  post,
  slug,
  themeKey,
}: {
  post: PublicPostListItem;
  slug: string;
  themeKey?: string;
}) {
  const visualTheme = getPublicVisualTheme(themeKey);

  return (
    <Link
      href={`/gy/${slug}/posts/${post.slug}`}
      className="public-card group block rounded-[var(--public-radius)] overflow-hidden border h-full"
      style={{
        backgroundColor: "color-mix(in srgb, var(--public-surface) 94%, white)",
        borderColor: "color-mix(in srgb, var(--public-ink) 8%, transparent)",
      }}
    >
      {/* Borítókép */}
      {post.cover_image_url ? (
        <div className="aspect-[16/10] overflow-hidden relative">
          <Image
            src={post.cover_image_url}
            alt=""
            fill
            sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
            unoptimized={shouldBypassPublicImageOptimization(
              post.cover_image_url,
            )}
            className="object-cover transition-transform duration-700 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
          <div
            className="absolute inset-0 transition-opacity duration-500 opacity-0 group-hover:opacity-100"
            style={{
              background: `linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--public-ink) 30%, transparent) 100%)`,
            }}
          />
        </div>
      ) : (
        // Ha nincs kép, színes gradient placeholder
        <div
          className="aspect-[16/10] relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, var(--public-primary) 0%, color-mix(in srgb, var(--public-primary) 70%, var(--public-accent)) 100%)`,
          }}
        >
          {visualTheme && (
            <Image
              src={visualTheme.assets.hero}
              alt=""
              fill
              sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
              className="object-cover opacity-45"
              style={{ objectPosition: visualTheme.hero.backgroundPosition }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--public-primary) 74%, transparent), color-mix(in srgb, var(--public-accent) 48%, transparent))",
            }}
          />
          <svg
            className="absolute inset-0 w-full h-full opacity-20"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id={`card-pattern-${post.id}`}
                x="0"
                y="0"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="20" cy="20" r="1" fill="white" />
                <circle cx="0" cy="0" r="0.5" fill="white" />
              </pattern>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill={`url(#card-pattern-${post.id})`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="font-serif text-6xl sm:text-7xl font-bold opacity-30 text-white">
              {post.title.charAt(0)}
            </div>
          </div>
        </div>
      )}

      {/* Tartalom */}
      <div className="p-5 sm:p-6 flex flex-col">
        {/* Dátum */}
        {post.published_at && (
          <div
            className="flex items-center gap-1.5 text-xs font-medium mb-3 uppercase tracking-wider"
            style={{ color: "var(--public-accent-on-surface)" }}
          >
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(post.published_at)}
          </div>
        )}

        <h3
          className="mb-3 transition-colors group-hover:[color:var(--public-primary-on-surface)] leading-tight"
          style={{ color: "var(--public-ink)" }}
        >
          {post.title}
        </h3>

        {post.excerpt && (
          <p
            className="text-sm sm:text-base leading-relaxed line-clamp-3 mb-4"
            style={{ color: "var(--public-muted)" }}
          >
            {post.excerpt}
          </p>
        )}

        <div
          className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: "var(--public-primary-on-surface)" }}
        >
          Olvasom
          <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  );
}
