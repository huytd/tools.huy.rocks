export interface SvgExample {
  name: string
  description: string
  code: string
}

export const SVG_EXAMPLES: SvgExample[] = [
  {
    name: 'Badge',
    description: 'Gradients, shapes and text',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6c49b" />
      <stop offset="1" stop-color="#d97757" />
    </linearGradient>
    <clipPath id="disc">
      <circle cx="120" cy="120" r="96" />
    </clipPath>
  </defs>

  <circle cx="120" cy="120" r="108" fill="#faf9f5" stroke="#141413" stroke-width="4" />
  <g clip-path="url(#disc)">
    <rect width="240" height="240" fill="url(#sky)" />
    <circle cx="120" cy="138" r="34" fill="#faf9f5" opacity="0.9" />
    <path d="M24 170 L84 112 L118 146 L150 114 L216 170 V240 H24 Z" fill="#141413" />
    <path d="M84 112 L100 128 L92 134 L84 126 L76 134 L68 128 Z" fill="#faf9f5" />
  </g>
  <text x="120" y="226" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="13" font-weight="700" letter-spacing="3" fill="#141413">TOOLS</text>
</svg>
`,
  },
  {
    name: 'Icon',
    description: 'A 24×24 stroke icon',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
     fill="none" stroke="#141413" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <!-- A pen drawing a curve: stroke icons scale cleanly when every path shares one stroke width -->
  <path d="M4 20c4-1 6-4 7-8s3-7 9-8" />
  <circle cx="4" cy="20" r="1.5" fill="#141413" />
  <circle cx="20" cy="4" r="1.5" fill="#141413" />
  <path d="M11 12h5" stroke-dasharray="1.5 2.5" />
</svg>
`,
  },
  {
    name: 'Loader',
    description: 'SMIL and CSS animation',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <style>
    .dot { fill: #d97757; animation: pulse 1.2s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
    .dot:nth-child(2) { animation-delay: 0.15s; }
    .dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse { 0%, 100% { transform: scale(0.6); opacity: 0.5; } 50% { transform: scale(1); opacity: 1; } }
  </style>

  <!-- A ring that turns with SMIL -->
  <circle cx="60" cy="60" r="44" fill="none" stroke="#e8e6dc" stroke-width="8" />
  <circle cx="60" cy="60" r="44" fill="none" stroke="#141413" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="70 207">
    <animateTransform attributeName="transform" type="rotate"
                      from="0 60 60" to="360 60 60" dur="1.4s" repeatCount="indefinite" />
  </circle>

  <!-- Three dots that pulse with CSS -->
  <g>
    <circle class="dot" cx="44" cy="60" r="6" />
    <circle class="dot" cx="60" cy="60" r="6" />
    <circle class="dot" cx="76" cy="60" r="6" />
  </g>
</svg>
`,
  },
  {
    name: 'Bar chart',
    description: 'Axes, labels and a highlighted bar',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260" viewBox="0 0 420 260"
     font-family="ui-sans-serif, system-ui, sans-serif">
  <rect width="420" height="260" rx="12" fill="#faf9f5" />
  <text x="28" y="36" font-size="15" font-weight="700" fill="#141413">Weekly active users</text>
  <text x="28" y="56" font-size="12" fill="#5e5d59">Thousands, last six weeks</text>

  <!-- Grid -->
  <g stroke="#e8e6dc" stroke-width="1">
    <line x1="56" y1="90" x2="392" y2="90" />
    <line x1="56" y1="140" x2="392" y2="140" />
    <line x1="56" y1="190" x2="392" y2="190" />
  </g>
  <g font-size="11" fill="#8f8d86" text-anchor="end">
    <text x="48" y="94">60</text>
    <text x="48" y="144">30</text>
    <text x="48" y="194">0</text>
  </g>

  <!-- Bars: 0 at y=190, 60 at y=90 -->
  <g fill="#cfcdc4">
    <rect x="72" y="140" width="36" height="50" rx="3" />
    <rect x="126" y="128" width="36" height="62" rx="3" />
    <rect x="180" y="132" width="36" height="58" rx="3" />
    <rect x="234" y="115" width="36" height="75" rx="3" />
    <rect x="288" y="105" width="36" height="85" rx="3" />
  </g>
  <rect x="342" y="92" width="36" height="98" rx="3" fill="#d97757" />
  <text x="360" y="84" font-size="12" font-weight="700" fill="#c6613f" text-anchor="middle">59</text>

  <g font-size="11" fill="#5e5d59" text-anchor="middle">
    <text x="90" y="210">W1</text>
    <text x="144" y="210">W2</text>
    <text x="198" y="210">W3</text>
    <text x="252" y="210">W4</text>
    <text x="306" y="210">W5</text>
    <text x="360" y="210">W6</text>
  </g>
</svg>
`,
  },
  {
    name: 'Pattern & filter',
    description: 'A tiled pattern under a soft shadow',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="8" r="2" fill="#d4a27f" />
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#141413" flood-opacity="0.18" />
    </filter>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="1" stop-color="#f0eee6" />
    </linearGradient>
  </defs>

  <rect width="320" height="200" fill="#faf9f5" />
  <rect width="320" height="200" fill="url(#dots)" opacity="0.6" />
  <g filter="url(#shadow)">
    <rect x="60" y="44" width="200" height="112" rx="14" fill="url(#card)" />
  </g>
  <circle cx="96" cy="80" r="14" fill="#d97757" />
  <rect x="122" y="70" width="104" height="9" rx="4.5" fill="#141413" />
  <rect x="122" y="86" width="68" height="7" rx="3.5" fill="#b0aea5" />
  <rect x="82" y="116" width="156" height="8" rx="4" fill="#e8e6dc" />
  <rect x="82" y="116" width="98" height="8" rx="4" fill="#788c5d" />
</svg>
`,
  },
]

export const SVG_STARTER = SVG_EXAMPLES[0].code
