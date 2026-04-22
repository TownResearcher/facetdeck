import { Blocks, Cpu, Mail, User, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { InstalledPlugin } from "../types/plugins";

export type ProfileTab = "profile" | "models" | "plugins" | "templates" | "contact";

export type ProfileTabConfig = {
  id: ProfileTab;
  label: string;
  icon: LucideIcon;
};

export const TAKEN_USERNAMES = ["admin", "root", "FacetDeck", "AI_Master"];

export const INITIAL_PLUGINS: InstalledPlugin[] = [];

export const PROFILE_TABS: ProfileTabConfig[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "models", label: "Models", icon: Cpu },
  { id: "plugins", label: "Plugins", icon: Blocks },
  { id: "templates", label: "Templates", icon: Wand2 },
  { id: "contact", label: "Contact Us", icon: Mail },
];
