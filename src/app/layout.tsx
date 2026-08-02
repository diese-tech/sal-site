import type { Metadata } from "next";
import { NavShell } from "@/components/nav/NavShell";
import { TickerBar } from "@/components/nav/TickerBar";
import { getLeagueData } from "@/lib/league-data";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://sal-draft-league.vercel.app"),
  title: "Serpent Ascension League",
  description: "Official hub for the Serpent Ascension League",
  icons: {
    icon: [{ url: "/assets/sal-logo.png", type: "image/png" }],
    apple: "/assets/sal-logo.png",
  },
  openGraph: {
    title: "Serpent Ascension League",
    description: "Official hub for the Serpent Ascension League",
    images: ["/assets/sal-logo.png"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { season } = await getLeagueData();

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <NavShell ticker={<TickerBar />} season={season}>{children}</NavShell>
      </body>
    </html>
  );
}
