import {
  GalleryHorizontalEnd,
  Link2,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

// Studio (/studio) is intentionally absent: it is a contextual editor reached
// from artifact cards in agent chat, the library, and account post approvals.
export const navItems = [
  { to: "/create", label: "Agent", icon: Sparkles },
  { to: "/tools", label: "Create", icon: SlidersHorizontal },
  { to: "/accounts", label: "Accounts", icon: Link2 },
  { to: "/library", label: "Library", icon: GalleryHorizontalEnd },
  { to: "/settings", label: "Settings", icon: Settings },
];
