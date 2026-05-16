export type PlayerRole = "Solo" | "Jungle" | "Mid" | "Carry" | "Support" | "Flex";

export type PlayerStatus = "free-agent" | "org-affiliated" | "drafted" | "queued-ghost" | "active";

export type PlayerProfile = {
  id: string;
  discordId: string;
  discordUsername: string;
  ign: string;
  avatarInitials: string;
  avatarGradient: string;
  bannerGradient: string;
  timezone: string;
  primaryRole: PlayerRole;
  secondaryRoles: PlayerRole[];
  tags: string[];
  status: PlayerStatus;
  orgName?: string;
};

export type RosterSlotState = "empty" | "drafted" | "queued-ghost" | "active";

export type RosterSlot = {
  slotNumber: number;
  pickNumber?: number;
  state: RosterSlotState;
  player?: PlayerProfile;
  projectedPlayer?: PlayerProfile;
};

export type OrgRoster = {
  id: string;
  name: string;
  slug: string;
  logoInitials: string;
  accentColor: string;
  headerGradient: string;
  captain: PlayerProfile;
  draftPosition: number;
  state: "inactive" | "active" | "completed";
  slots: RosterSlot[];
};
