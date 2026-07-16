import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getEffectiveAccessContext } from "@/lib/auth/effective-access";
import { ForumThreadView } from "@/components/muhely/forum/forum-thread-view";
import { ArrowLeft } from "lucide-react";

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ ideaId: string }>;
}) {
  const { ideaId } = await params;
  const { user, profile, supabase } = await getEffectiveAccessContext();
  if (!user) redirect("/login");

  const { data: idea, error } = await supabase
    .from("mm_otletek")
    .select(
      "*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))",
    )
    .eq("id", ideaId)
    .eq("aktiv", true)
    .single();

  if (error || !idea) notFound();

  // Check user's votes
  const { data: votes } = await supabase
    .from("mm_szavazatok")
    .select("tipus")
    .eq("otlet_id", ideaId)
    .eq("user_id", user.id);

  const mySupport = (votes || []).some(
    (v: { tipus: string }) => v.tipus === "tamogatas",
  );
  const myJoin = (votes || []).some(
    (v: { tipus: string }) => v.tipus === "csatlakozas",
  );

  const enrichedIdea = {
    ...(idea as Record<string, unknown>),
    mySupport,
    myJoin,
  } as Parameters<typeof ForumThreadView>[0]["idea"];

  // D1 — projekt-réteg jogosultságok
  const ideaRow = idea as { otletgazda_id?: string | null };
  const isOwner = ideaRow.otletgazda_id === user.id;
  const isMember = myJoin;
  const isAdmin = profile?.status === "active" && profile.role === "admin";

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-6 pb-10">
      <Link
        href="/misszios-muhely/forum"
        className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-[#ded1be] bg-[#fffdf7]/90 px-3.5 py-2 text-sm font-medium text-[#5d685e] shadow-sm transition duration-200 hover:-translate-x-0.5 hover:border-[#9daa8f] hover:text-[#26382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3a45e]/50 motion-reduce:transition-none"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none" />
        Vissza az Ötletasztalhoz
      </Link>

      <ForumThreadView
        idea={enrichedIdea}
        serverNow={new Date().toISOString()}
        currentUserId={user.id}
        isOwner={isOwner}
        isMember={isMember}
        isAdmin={isAdmin}
      />
    </div>
  );
}
