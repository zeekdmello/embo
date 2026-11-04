import type { ReactNode } from 'react';

/** The Embo wordmark: heavy lowercase type followed by a thin green asterisk. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      embo
      <Asterisk size={size * 0.62} />
    </span>
  );
}

export function Asterisk({ size = 18, color = 'var(--leaf)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="asterisk">
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
        <line x1="19.1" y1="4.9" x2="4.9" y2="19.1" />
      </g>
    </svg>
  );
}

export function Sparkle({ size = 30, color = 'var(--yellow)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 2 L23 16 L38 20 L23 24 L20 38 L17 24 L2 20 L17 16 Z" fill={color} />
    </svg>
  );
}

/** Flat apple illustration: coral body with shaded side, mint leaf, dark outline. */
export function Apple({ size = 64 }: { size?: number }) {
  const body =
    'M32 21 C 26 15.5, 12 16, 11 32 C 10 46, 20 58, 27 58 C 29.5 58, 30.5 56.6, 32 56.6 C 33.5 56.6, 34.5 58, 37 58 C 44 58, 54 46, 53 32 C 52 16, 38 15.5, 32 21 Z';
  const id = `apple-clip-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill="#ff7a62" />
      <g clipPath={`url(#${id})`}>
        <ellipse cx="54" cy="38" rx="11" ry="24" fill="#e8604d" />
        <ellipse cx="18.5" cy="34" rx="4" ry="11" fill="#ffa08e" />
      </g>
      <path d={body} fill="none" stroke="#2f3033" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M28.5 23.5 q3.5 2.6 7 0" fill="none" stroke="#2f3033" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M32 21 C 32 14, 34.5 9.5, 39.5 7" fill="none" stroke="#2f3033" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33.5 11 C 28 3.5, 18 3.5, 12.5 8 C 18 14.5, 27.5 15.5, 33.5 11 Z" fill="#4fe39a" stroke="#2f3033" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M31 10.4 Q 23 8.4 16 8.2" fill="none" stroke="#2f3033" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Smiling sun on a horizon, as in the dashboard hero. */
export function Sun({ size = 130 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" aria-hidden="true">
      <circle cx="70" cy="70" r="66" fill="none" stroke="#a9b89a" strokeDasharray="3 5" />
      <g stroke="#23241f" strokeWidth="3" strokeLinecap="round">
        <line x1="70" y1="22" x2="70" y2="36" />
        <line x1="36" y1="38" x2="45" y2="48" />
        <line x1="104" y1="38" x2="95" y2="48" />
        <line x1="22" y1="66" x2="35" y2="68" />
        <line x1="118" y1="66" x2="105" y2="68" />
      </g>
      <path d="M38 86 A32 32 0 0 1 102 86 Z" fill="#f5d36b" stroke="#23241f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M58 70 q3 -4 6 0 M76 70 q3 -4 6 0" fill="none" stroke="#23241f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 78 q10 7 20 0" fill="none" stroke="#23241f" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="28" y1="90" x2="112" y2="86" stroke="#23241f" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const paths: Record<string, ReactNode> = {
  roster: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  coverage: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  issues: (
    <>
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </>
  ),
  changes: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  setup: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  guide: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.6 5.2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  flame: <path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4.3 3 7 7 7z" />,
  arrow: <path d="M7 17 17 7M8 7h9v9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.8-.7-.7-2.8z" />,
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Pencil({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <polygon points="0,0 14,-4.6 14,4.6" fill="#1f2340" />
      <polygon points="14,-4.6 34,-11 34,11 14,4.6" fill="#f8d7b0" />
      <rect x="34" y="-11" width="66" height="22" fill="#f6c42a" />
      <circle cx="34" cy="-7.4" r="3.7" fill="#f6c42a" />
      <circle cx="34" cy="0" r="3.7" fill="#f6c42a" />
      <circle cx="34" cy="7.4" r="3.7" fill="#f6c42a" />
      <rect x="44" y="-4.3" width="50" height="1.6" rx="0.8" fill="#fbe2a6" />
      <rect x="52" y="3" width="40" height="1.6" rx="0.8" fill="#fbe2a6" />
      <rect x="100" y="-11" width="8" height="22" fill="#5d5d5d" />
      <rect x="108" y="-11" width="12" height="22" rx="2.5" fill="#f07f86" />
    </g>
  );
}

/** Two crossed yellow pencils, flat style — used where people edit things. */
export function Pencils({ width = 140 }: { width?: number }) {
  return (
    <svg width={width} height={width * 0.56} viewBox="0 0 136 76" aria-hidden="true">
      <Pencil transform="translate(6 52) rotate(-10)" />
      <Pencil transform="translate(10 21) rotate(17)" />
    </svg>
  );
}
