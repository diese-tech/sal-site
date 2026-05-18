import { AnnouncementCard } from "@/components/league/AnnouncementCard";
import { requireAdmin } from "@/lib/admin-auth";
import { getLeagueData } from "@/lib/league-data";

export const metadata = { title: "Announcements - SAL Admin" };

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const { announcements } = await getLeagueData();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/70">Admin</p>
        <h1 className="text-2xl font-black text-white">Announcements</h1>
        <p className="mt-1 text-sm font-semibold text-slate-400">Announcement editing is still read-only in this pass; schedule, roster, and standings are editable.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {announcements.map((announcement) => (
          <AnnouncementCard key={announcement.id} announcement={announcement} />
        ))}
      </div>
    </main>
  );
}
