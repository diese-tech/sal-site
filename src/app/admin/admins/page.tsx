import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminUsers } from "@/lib/admin-users";
import { AdminAdminsClient } from "@/components/admin/AdminAdminsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admins — SAL Admin" };

export default async function AdminAdminsPage() {
  const session = await requireAdmin();
  if (session.role !== "super_admin") redirect("/admin");

  const admins = await getAdminUsers();

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
