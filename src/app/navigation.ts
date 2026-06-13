import {
  BarChart3,
  Bot,
  Building2,
  Clapperboard,
  GalleryHorizontalEnd,
  ScanSearch,
  LayoutDashboard,
  Link2,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";

export const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/create", label: "Create", icon: Sparkles },
  { to: "/analyze", label: "Analyze", icon: ScanSearch },
  { to: "/studio", label: "Studio", icon: Clapperboard },
  { to: "/brands", label: "Brands", icon: Building2 },
  { to: "/personas", label: "Personas", icon: UserRound },
  { to: "/accounts", label: "Accounts", icon: Link2 },
  { to: "/workflows", label: "Workflows", icon: Bot },
  { to: "/library", label: "Library", icon: GalleryHorizontalEnd },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];
