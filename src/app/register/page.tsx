import { redirect } from "next/navigation";
import {
  getAuthUser,
  getDiscordId,
  getDiscordDisplayName,
  getDiscordUsername,
} from "@/lib/supabase-auth-server";
import {
  getFormFields,
  getPlayerClaimCandidateByDiscordUsername,
  getPlayerByDiscordId,
  getRegistrationByDiscordId,
} from "@/lib/league-data";
import { RegisterClient } from "@/components/auth/RegisterClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register — SAL" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ skip?: string }>;
}) {
  const { skip } = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect("/auth/signin");

  const discordId = getDiscordId(user);
  if (!discordId) redirect("/auth/error?message=discord_id_missing");
  const discordUsername = getDiscordUsername(user);

  const [formFields, claimedPlayer, existingReg, claimCandidate] = await Promise.all([
    getFormFields(),
    getPlayerByDiscordId(discordId),
    getRegistrationByDiscordId(discordId),
    getPlayerClaimCandidateByDiscordUsername(discordUsername),
  ]);

  const matchedByUsername = !claimedPlayer && !skip && claimCandidate.kind === "available"
    ? claimCandidate.player
    : null;
  const identityBlocker = claimedPlayer
    ? null
    : !discordUsername
      ? "username-missing"
      : claimCandidate.kind === "ambiguous"
        ? "ambiguous"
        : claimCandidate.kind === "unavailable"
          ? "unavailable"
          : skip && claimCandidate.kind === "available"
            ? "declined-match"
            : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="mb-1 text-[0.65rem] font-black uppercase tracking-widest text-cyan-300">
          Serpent Ascension League
        </p>
        <h1 className="text-2xl font-black text-white">
          {claimedPlayer ? "Your Profile" : "Player Registration"}
        </h1>
      </div>
      <RegisterClient
        discordDisplayName={getDiscordDisplayName(user)}
        claimedPlayer={claimedPlayer}
        matchedByUsername={matchedByUsername}
        identityBlocker={identityBlocker}
        existingRegistration={existingReg}
        formFields={formFields}
      />
    </main>
  );
}
