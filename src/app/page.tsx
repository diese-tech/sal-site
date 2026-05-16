import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="max-w-2xl text-center">
        <p className="text-sm font-black uppercase tracking-normal text-cyan-200">Serpent Ascension League</p>
        <h1 className="mt-4 text-4xl font-black text-white sm:text-6xl">Draft Platform Lab</h1>
        <p className="mt-5 text-lg font-medium leading-8 text-slate-300">
          Phase 1 is focused on visual identity and reusable mock-data cards.
        </p>
        <Link
          href="/lab/cards"
          className="mt-8 inline-flex rounded-full border border-cyan-200/30 bg-cyan-200/10 px-5 py-3 text-sm font-black uppercase text-cyan-50 shadow-lg shadow-cyan-500/10 transition hover:-translate-y-0.5 hover:bg-cyan-200/15"
        >
          Open Card Lab
        </Link>
      </div>
    </main>
  );
}
