import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import type { SocialAccount } from "./accountDisplay";

type AccountAvatarProps = {
  account: SocialAccount;
  showFallback?: boolean;
  size?: "sm" | "md";
};

const sizeClasses = {
  sm: { frame: "size-9", icon: 15 },
  md: { frame: "size-12", icon: 20 },
} as const;

export function AccountAvatar({
  account,
  showFallback = true,
  size = "sm",
}: AccountAvatarProps) {
  const [imageVisible, setImageVisible] = useState(Boolean(account.avatarUrl));
  const sizing = sizeClasses[size];

  useEffect(() => {
    setImageVisible(Boolean(account.avatarUrl));
  }, [account.avatarUrl]);

  if (!account.avatarUrl || !imageVisible) {
    return showFallback ? (
      <span
        aria-label={`${account.displayName || account.username} profile image unavailable`}
        className={`grid ${sizing.frame} shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-page)] text-[var(--color-ink-faint)]`}
      >
        <Bot size={sizing.icon} />
      </span>
    ) : null;
  }

  return (
    <span
      aria-label={`${account.displayName || account.username} profile image`}
      className={`flex ${sizing.frame} shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-page)] shadow-[inset_0_1px_0_oklch(100%_0_0_/_0.82)]`}
    >
      <img
        alt=""
        className="size-full object-cover"
        loading="lazy"
        onError={() => setImageVisible(false)}
        referrerPolicy="no-referrer"
        src={account.avatarUrl}
      />
    </span>
  );
}
