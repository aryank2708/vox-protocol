import React from "react";

// AYN/AI Aperture mark (matches /favicon.svg, sized for inline use).
export default function Aperture({ size = 28 }) {
  return (
    <svg
      className="aperture-glyph"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="AYN/AI"
    >
      <rect width="32" height="32" rx="4" fill="#0b0b0c" />
      <path d="M 28 4 L 28 28 L 4 28 L 18 4 Z" fill="#f4f1ea" />
      <path d="M 4 2 L 18 2 L 4 26 Z" fill="none" stroke="#f4f1ea" strokeWidth="1" />
      <path d="M 19 2 L 5 26" stroke="#ff5b1f" strokeWidth="0.9" />
    </svg>
  );
}
