export function Diya({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 28h30c-2.5 10-8.5 14-15 14S11.5 38 9 28Z"
        fill="currentColor"
      />
      <path d="M24 5c-9 11-9 17 0 21 9-4 9-10 0-21Z" fill="currentColor" />
      <path d="M24 15c-3 4-3 7 0 9 3-2 3-5 0-9Z" fill="#fff" opacity=".5" />
    </svg>
  );
}
export function Brand({
  light = false,
  small = false,
}: {
  light?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`brand ${light ? "light" : ""}`}>
      <div className="brand-icon">
        <Diya size={small ? 26 : 32} />
      </div>
      {!small && (
        <div>
          <span className="wordmark">
            JP<span>faral</span>
            <span className="brand-period">.</span>
          </span>
          <span className="brand-tagline">A SEASON OF TOGETHERNESS</span>
        </div>
      )}
    </div>
  );
}
