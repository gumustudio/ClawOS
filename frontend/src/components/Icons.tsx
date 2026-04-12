import React from 'react';

export const DashboardIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="28" height="18" rx="3" fill="url(#dash-bg)" />
    <rect x="4" y="7" width="24" height="12" rx="1" fill="#1e293b" />
    <path d="M10 23v4M22 23v4M8 27h16" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/>
    <path d="M6 16l4-4 4 4 2-2 4 4" stroke="url(#dash-line)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <defs>
      <linearGradient id="dash-bg" x1="2" y1="5" x2="30" y2="23" gradientUnits="userSpaceOnUse">
        <stop stopColor="#60a5fa" />
        <stop offset="1" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id="dash-line" x1="6" y1="12" x2="20" y2="16" gradientUnits="userSpaceOnUse">
        <stop stopColor="#38bdf8" />
        <stop offset="1" stopColor="#818cf8" />
      </linearGradient>
    </defs>
  </svg>
);

export const MonitorIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M16 31c9-4 12-12 12-20V6L16 2 4 6v5c0 8 3 16 12 20z" fill="url(#mon-bg)" />
    <path d="M16 29c7-3.5 9-10 9-16.5V7.5L16 4.5 7 7.5V12.5C7 19 9 25.5 16 29z" fill="url(#mon-inner)" />
    <path d="M9 16h3l2-4 3 8 2-4h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <defs>
      <linearGradient id="mon-bg" x1="4" y1="2" x2="28" y2="31" gradientUnits="userSpaceOnUse">
        <stop stopColor="#10b981" />
        <stop offset="1" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="mon-inner" x1="7" y1="4.5" x2="25" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#34d399" />
        <stop offset="1" stopColor="#059669" />
      </linearGradient>
    </defs>
  </svg>
);

export const FilesIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M3 10.5C3 8.57 4.57 7 6.5 7h6.17c.93 0 1.82.37 2.48 1.03l1.7 1.7c.33.33.78.52 1.25.52H25.5C27.43 10.25 29 11.82 29 13.75v12.5C29 28.18 27.43 29.75 25.5 29.75h-19C4.57 29.75 3 28.18 3 26.25v-15.75z" fill="url(#file-bg)"/>
    <path d="M3 12.5C3 10.57 4.57 9 6.5 9h22.5c1.1 0 2 .9 2 2v14.75c0 1.93-1.57 3.5-3.5 3.5h-19C4.57 29.25 3 27.68 3 25.82v-13.32z" fill="url(#file-front)"/>
    <path d="M12 18h8M12 22h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
    <defs>
      <linearGradient id="file-bg" x1="3" y1="7" x2="29" y2="29.75" gradientUnits="userSpaceOnUse">
        <stop stopColor="#a855f7" />
        <stop offset="1" stopColor="#7e22ce" />
      </linearGradient>
      <linearGradient id="file-front" x1="3" y1="9" x2="31" y2="29.25" gradientUnits="userSpaceOnUse">
        <stop stopColor="#c084fc" />
        <stop offset="1" stopColor="#9333ea" />
      </linearGradient>
    </defs>
  </svg>
);

export const VideoIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="6" width="28" height="20" rx="4" fill="url(#vid-bg)"/>
    <path d="M2 10h28M2 24h28M8 6v4M16 6v4M24 6v4M8 24v4M16 24v4M24 24v4" stroke="#4c0519" strokeWidth="1.5" opacity="0.5"/>
    <circle cx="16" cy="17" r="6" fill="#fff" />
    <path d="M14.5 14l4 3-4 3v-6z" fill="#e11d48"/>
    <defs>
      <linearGradient id="vid-bg" x1="2" y1="6" x2="30" y2="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fb7185" />
        <stop offset="1" stopColor="#be123c" />
      </linearGradient>
    </defs>
  </svg>
);

export const LocalMusicIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="url(#lmus-bg)"/>
    <circle cx="16" cy="16" r="4" fill="#047857" opacity="0.3"/>
    <path d="M18.5 10v9.26A3.5 3.5 0 0 0 16.5 18a3.5 3.5 0 1 0 3.5 3.5V13l4-1.5V9.5l-5.5 1.5z" fill="#fff"/>
    <defs>
      <linearGradient id="lmus-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#34d399" />
        <stop offset="1" stopColor="#047857" />
      </linearGradient>
    </defs>
  </svg>
);

export const DownloadsIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="url(#dl-bg)"/>
    <path d="M16 8v11m0 0l-4-4m4 4l4-4M10 23h12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <defs>
      <linearGradient id="dl-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2dd4bf" />
        <stop offset="1" stopColor="#0f766e" />
      </linearGradient>
    </defs>
  </svg>
);

export const NotesIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M6 5c0-1.1.9-2 2-2h12.5L26 8.5V27c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2V5z" fill="url(#notes-bg)"/>
    <path d="M20.5 3v5.5H26L20.5 3z" fill="#fef08a"/>
    <path d="M10 13h12M10 18h12M10 23h8" stroke="#a16207" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
    <defs>
      <linearGradient id="notes-bg" x1="6" y1="3" x2="26" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fde047" />
        <stop offset="1" stopColor="#ca8a04" />
      </linearGradient>
    </defs>
  </svg>
);

export const ReaderIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="24" height="24" rx="5" fill="url(#read-bg)"/>
    <circle cx="10" cy="22" r="2" fill="#fff"/>
    <path d="M8 15a7 7 0 0 1 7 7M8 9a13 13 0 0 1 13 13" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    <defs>
      <linearGradient id="read-bg" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fb923c" />
        <stop offset="1" stopColor="#c2410c" />
      </linearGradient>
    </defs>
  </svg>
);

export const CronIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="url(#cron-bg)"/>
    <circle cx="16" cy="16" r="10" stroke="#fff" strokeWidth="2" strokeDasharray="2 4" opacity="0.4"/>
    <path d="M16 10v6l4 4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="16" cy="16" r="2" fill="#fff"/>
    <defs>
      <linearGradient id="cron-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818cf8" />
        <stop offset="1" stopColor="#4338ca" />
      </linearGradient>
    </defs>
  </svg>
);

export const BaiduIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="url(#baidu-bg)" />
    <g transform="translate(8, 8) scale(0.6666)">
      <path fill="#ffffff" d="M9.154 0C7.71 0 6.54 1.658 6.54 3.707c0 2.051 1.171 3.71 2.615 3.71 1.446 0 2.614-1.659 2.614-3.71C11.768 1.658 10.6 0 9.154 0zm7.025.594C14.86.58 13.347 2.589 13.2 3.927c-.187 1.745.25 3.487 2.179 3.735 1.933.25 3.175-1.806 3.422-3.364.252-1.555-.995-3.364-2.362-3.674a1.218 1.218 0 0 0-.261-.03zM3.582 5.535a2.811 2.811 0 0 0-.156.008c-2.118.19-2.428 3.24-2.428 3.24-.287 1.41.686 4.425 3.297 3.864 2.617-.561 2.262-3.68 2.183-4.362-.125-1.018-1.292-2.773-2.896-2.75zm16.534 1.753c-2.308 0-2.617 2.119-2.617 3.616 0 1.43.121 3.425 2.988 3.362 2.867-.063 2.553-3.238 2.553-3.988 0-.745-.62-2.99-2.924-2.99zm-8.264 2.478c-1.424.014-2.708.925-3.323 1.947-1.118 1.868-2.863 3.05-3.112 3.363-.25.309-3.61 2.116-2.864 5.42.746 3.301 3.365 3.237 3.365 3.237s1.93.19 4.171-.31c2.24-.495 4.17.123 4.17.123s5.233 1.748 6.665-1.616c1.43-3.364-.808-5.109-.808-5.109s-2.99-2.306-4.736-4.798c-1.072-1.665-2.348-2.268-3.528-2.257zm-2.234 3.84l1.542.024v8.197H7.758c-1.47-.291-2.055-1.292-2.13-1.462-.072-.173-.488-.976-.268-2.343.635-2.049 2.447-2.196 2.447-2.196h1.81zm3.964 2.39v3.881c.096.413.612.488.612.488h1.614v-4.343h1.689v5.782h-3.915c-1.517-.39-1.59-1.465-1.59-1.465v-4.317zm-5.458 1.147c-.66.197-.978.708-1.05.928-.076.22-.247.78-.1 1.269.294 1.095 1.248 1.144 1.248 1.144h1.37v-3.34z"/>
    </g>
    <defs>
      <linearGradient id="baidu-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#0652DD" />
      </linearGradient>
    </defs>
  </svg>
);

export const QuarkIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" fill="url(#quark-bg)" />
    <path d="M35 24c0 .878-.284 4.274-1.127 4.283c-7.274.07-7.959-.899-8.983 6.588C24.751 35.885 24.072 36 23 36c-6.627 0-12-5.373-12-12s5.373-12 12-12s12 5.373 12 12" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="24" r="16" stroke="#ffffff" strokeWidth="2" strokeDasharray="60 100" strokeLinecap="round" opacity="0.4" transform="rotate(-45 24 24)" />
    <defs>
      <linearGradient id="quark-bg" x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818cf8" />
        <stop offset="1" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
  </svg>
);

export const NeteaseIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14" fill="url(#netease-bg)" />
    <g transform="translate(2, 2) scale(1.1666)">
      <path fill="#ffffff" d="M13.046 9.388a3.919 3.919 0 0 0-.66.19c-.809.312-1.447.991-1.666 1.775a2.269 2.269 0 0 0-.074.81c.048.546.333 1.05.764 1.35a1.483 1.483 0 0 0 2.01-.286c.406-.531.355-1.183.24-1.636-.098-.387-.22-.816-.345-1.249a64.76 64.76 0 0 1-.269-.954zm-.82 10.07c-3.984 0-7.224-3.24-7.224-7.223 0-.98.226-3.02 1.884-4.822A7.188 7.188 0 0 1 9.502 5.6a.792.792 0 1 1 .587 1.472 5.619 5.619 0 0 0-2.795 2.462 5.538 5.538 0 0 0-.707 2.7 5.645 5.645 0 0 0 5.638 5.638c1.844 0 3.627-.953 4.542-2.428 1.042-1.68.772-3.931-.627-5.238a3.299 3.299 0 0 0-1.437-.777c.172.589.334 1.18.494 1.772.284 1.12.1 2.181-.519 2.989-.39.51-.956.888-1.592 1.064a3.038 3.038 0 0 1-2.58-.44 3.45 3.45 0 0 1-1.44-2.514c-.04-.467.002-.93.128-1.376.35-1.256 1.356-2.339 2.622-2.826a5.5 5.5 0 0 1 .823-.246l-.134-.505c-.37-1.371.25-2.579 1.547-3.007.329-.109.68-.145 1.025-.105.792.09 1.476.592 1.709 1.023.258.507-.096 1.153-.706 1.153a.788.788 0 0 1-.54-.213c-.088-.08-.163-.174-.259-.247a.825.825 0 0 0-.632-.166.807.807 0 0 0-.634.551c-.056.191-.031.406.02.595.07.256.159.597.217.82 1.11.098 2.162.54 2.97 1.296 1.974 1.844 2.35 4.886.892 7.233-1.197 1.93-3.509 3.177-5.889 3.177z" />
    </g>
    <defs>
      <linearGradient id="netease-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ff4b4b" />
        <stop offset="1" stopColor="#dc2626" />
      </linearGradient>
    </defs>
  </svg>
);

export const OpenClawIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 120 120" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="#ef4444" />
    <path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="#ef4444" />
    <path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="#ef4444" />
    <path d="M45 15 Q35 5 30 8" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" />
    <path d="M75 15 Q85 5 90 8" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" />
    <circle cx="45" cy="35" r="6" fill="#050810" />
    <circle cx="75" cy="35" r="6" fill="#050810" />
    <circle cx="46" cy="34" r="2" fill="#00e5cc" />
    <circle cx="76" cy="34" r="2" fill="#00e5cc" />
  </svg>
);

export const DidaIcon = ({ className, style }: { className?: string, style?: React.CSSProperties }) => (
  <svg viewBox="0 0 32 32" fill="none" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 4 A 12 12 0 1 0 28 16" stroke="#4a76f6" strokeWidth="4.5" />
    <path d="M 10 16 L 15 21 L 24 8" stroke="#f9a825" strokeWidth="4.5" strokeLinejoin="round" />
  </svg>
);
