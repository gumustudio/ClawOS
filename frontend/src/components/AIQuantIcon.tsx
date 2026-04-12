import React from 'react';

export default function AIQuantIcon({ className, style }: { className?: string, style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="url(#aiquant-bg)"/>
      
      {/* Grid lines for "AI/Quant" feel */}
      <path d="M7 10h18M7 16h18M7 22h18" stroke="#ffffff" strokeWidth="1" strokeDasharray="1 3" opacity="0.2"/>
      
      {/* Chart line */}
      <path d="M8 22l6-7 4 3 6-8" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      
      {/* Arrow */}
      <path d="M19 10h5v5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      
      {/* Nodes on chart line */}
      <circle cx="8" cy="22" r="1.5" fill="#ffffff" />
      <circle cx="14" cy="15" r="1.5" fill="#ffffff" />
      <circle cx="18" cy="18" r="1.5" fill="#ffffff" />
      
      <defs>
        <linearGradient id="aiquant-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
    </svg>
  );
}