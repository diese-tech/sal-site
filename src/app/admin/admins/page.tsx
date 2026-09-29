import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminUsers } from "@/lib/admin-users";
import { AdminAdminsClient } from "@/components/admin/AdminAdminsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admins — SAL Admin" };

export default async function AdminAdminsPage() {
  const session = await requireAdmin();
  const admins = await getAdminUsers();

  // Gate on the live row, not session.role: the cookie's embedded role is an
  // 8-hour-old snapshot with no server-side revocation, so trusting it here
  // would let someone demoted or removed since sign-in keep loading this
  // page — and see everyone's Discord IDs — until their cookie expires. The
  // admins list is already being fetched for the page itself; this reuses
  // that one query instead of adding a second lookup by discordId.
  const self = admins.find((a) => a.discordId === session.discordId);
  if (self?.role !== "super_admin") redirect("/admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-red-400/70">Admin · Superadmin</p>
        <h1 className="text-2xl font-black text-white">Admins</h1>
        <p className="mt-1 text-sm text-slate-500">
          Who can sign into /admin. Adding someone here is the entire grant — they sign in with the same Discord OAuth
          button on the login page once their ID is added, no deploy required.
        </p>
      </div>
      <AdminAdminsClient admins={admins} currentDiscordId={session.discordId} />
    </div>
  );
}
