import Link from "next/link";

export default function DraftNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070d] px-4">
      <div className="max-w-md text-center">
        <p className="mb-2 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300/60">Draft Room</p>
        <h1 className="mb-4 text-3xl font-black text-white">Room Not Found</h1>
        <p className="mb-8 text-sm font-semibold text-slate-400">
          This draft room doesn&apos;t exist or has already ended. Ask an admin for a fresh captain link.
        </p>
        <Link
          href="/schedule"
          className="inline-block rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-6 py-3 text-sm font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-300/20"
        >
          View Schedule
        </Link>
      </div>
    </div>
  );
}
