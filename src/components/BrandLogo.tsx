export function ContentEngineMark({
  className,
  title = "Content Engine",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      aria-label={title}
      className={className}
      fill="none"
      role="img"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        fill="oklch(15% 0.035 220)"
        height="56"
        rx="14"
        width="56"
        x="4"
        y="4"
      />
      <rect
        height="55"
        rx="13.5"
        stroke="oklch(100% 0 0 / 0.12)"
        width="55"
        x="4.5"
        y="4.5"
      />
      <path
        d="M22 20.5L38.5 32L22 43.5"
        stroke="oklch(83% 0.16 102)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
      />
      <path
        d="M43.8 16.6L46.5 25.2L55.1 27.9L46.5 30.6L43.8 39.2L41.1 30.6L32.5 27.9L41.1 25.2L43.8 16.6Z"
        fill="oklch(76% 0.13 145)"
      />
      <path
        d="M43.8 21.7L45.1 26.6L50 27.9L45.1 29.2L43.8 34.1L42.5 29.2L37.6 27.9L42.5 26.6L43.8 21.7Z"
        fill="oklch(15% 0.035 220)"
        opacity="0.28"
      />
    </svg>
  );
}
