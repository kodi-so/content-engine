import {
  Clapperboard,
  GalleryHorizontalEnd,
  ScanSearch,
  Link2,
  Repeat,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export const navItems = [
  { to: "/create", label: "Agent", icon: Sparkles },
  { to: "/tools", label: "Create", icon: SlidersHorizontal },
  { to: "/analyze", label: "Analyze", icon: ScanSearch },
  { to: "/studio", label: "Studio", icon: Clapperboard },
  { to: "/accounts", label: "Accounts", icon: Link2 },
  { to: "/automations", label: "Automations", icon: Repeat },
  { to: "/library", label: "Library", icon: GalleryHorizontalEnd },
  { to: "/settings", label: "Settings", icon: Settings },
];
