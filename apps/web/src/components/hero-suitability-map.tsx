const occurrencePoints = [
  [320, 145],
  [348, 162],
  [290, 180],
  [305, 135],
  [365, 148],
  [340, 175],
  [280, 160],
  [370, 165],
  [360, 130],
  [295, 155],
  [315, 170],
  [345, 140],
  [330, 185],
  [375, 155],
  [285, 145],
  [350, 190],
  [305, 168],
  [365, 178],
  [310, 150],
  [355, 160],
  [325, 140],
  [285, 175],
  [340, 155],
  [375, 185],
];

export const HeroSuitabilityMap = () => {
  return (
    <svg
      aria-label="Illustrative habitat suitability map with occurrence records"
      className="size-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      viewBox="0 0 860 480"
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--map-hero-sky-start)" />
          <stop offset="100%" stopColor="var(--map-hero-sky-end)" />
        </linearGradient>
        <linearGradient id="hero-suitability" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--suitability-0)" />
          <stop offset="25%" stopColor="var(--suitability-1)" />
          <stop offset="50%" stopColor="var(--suitability-2)" />
          <stop offset="75%" stopColor="var(--suitability-3)" />
          <stop offset="100%" stopColor="var(--suitability-4)" />
        </linearGradient>
        <pattern height="43" id="hero-grid" patternUnits="userSpaceOnUse" width="43">
          <path
            d="M43 0H0v43"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.2"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>

      <rect fill="url(#hero-sky)" height="480" width="860" />
      <rect fill="url(#hero-grid)" height="480" width="860" />
      <path
        d="M0 300c60-30 120-52 200-58 80-6 140-22 220-26 80-4 140 14 220 8 80-6 150 8 220 14v242H0Z"
        fill="var(--suitability-1)"
        opacity="0.28"
      />
      <path
        d="M0 340c80-32 160-55 260-48 100 7 160-20 250-24 90-4 150 17 240 10 70-6 105 10 110 17v185H0Z"
        fill="var(--suitability-2)"
        opacity="0.45"
      />
      <path
        d="M0 395c50-20 110-40 200-33 90 7 155-17 250-12 95 5 160 22 250 15 90-7 140 10 160 17v98H0Z"
        fill="url(#hero-suitability)"
        opacity="0.78"
      />

      {[360, 380, 400, 415].map((y) => (
        <path
          d={`M0 ${y}Q215 ${y - 12} 430 ${y + 5}t430-13`}
          fill="none"
          key={y}
          stroke="var(--foreground)"
          strokeDasharray="4 6"
          strokeOpacity="0.2"
          strokeWidth="0.4"
        />
      ))}

      {occurrencePoints.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} fill="var(--primary)" opacity="0.85" r="5.5" />
          <circle cx={x} cy={y} fill="var(--surface)" opacity="0.9" r="3" />
        </g>
      ))}

      <rect
        fill="none"
        height="340"
        opacity="0.6"
        stroke="var(--primary)"
        strokeDasharray="6 4"
        strokeWidth="1.2"
        width="740"
        x="60"
        y="100"
      />
      <rect fill="url(#hero-suitability)" height="7" rx="3.5" width="130" x="20" y="448" />
      <text fill="var(--foreground)" fontFamily="var(--font-mono)" fontSize="9" x="20" y="470">
        0 low
      </text>
      <text
        fill="var(--foreground)"
        fontFamily="var(--font-mono)"
        fontSize="9"
        textAnchor="middle"
        x="85"
        y="470"
      >
        0.5
      </text>
      <text
        fill="var(--foreground)"
        fontFamily="var(--font-mono)"
        fontSize="9"
        textAnchor="end"
        x="150"
        y="470"
      >
        1 high
      </text>
      <text
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        fontSize="8.5"
        x="65"
        y="118"
      >
        47.8°N 6.2°E
      </text>
      <text
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        fontSize="8.5"
        textAnchor="end"
        x="795"
        y="118"
      >
        49.6°N 9.4°E
      </text>
      <text
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        fontSize="10"
        textAnchor="middle"
        x="840"
        y="448"
      >
        N
      </text>
      <path d="m836 456 4-4 4 4" fill="var(--muted-foreground)" />
      <path
        d="M840 452v16M670 462h100M670 458v8m100-8v8"
        stroke="var(--muted-foreground)"
        strokeWidth="1.5"
      />
      <text
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        fontSize="8.5"
        textAnchor="middle"
        x="720"
        y="476"
      >
        50 km
      </text>
    </svg>
  );
};
