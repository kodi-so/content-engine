import {
  GalleryHorizontalEnd,
  Link2,
  Repeat,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

// Studio (/studio) is intentionally absent: it is a contextual editor reached
// from artifact cards in agent chat, the library, and automation approvals.
export const navItems = [
  { to: "/create", label: "Agent", icon: Sparkles },
  { to: "/tools", label: "Create", icon: SlidersHorizontal },
  { to: "/accounts", label: "Accounts", icon: Link2 },
  { to: "/automations", label: "Automations", icon: Repeat },
  { to: "/library", label: "Library", icon: GalleryHorizontalEnd },
  { to: "/settings", label: "Settings", icon: Settings },
];
