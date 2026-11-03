const desktopOccurrences = [
  [420, 182],
  [448, 205],
  [462, 168],
  [486, 220],
  [505, 188],
  [524, 210],
  [540, 174],
  [563, 198],
  [580, 226],
  [600, 185],
  [618, 211],
  [642, 193],
] as const;

const mobileOccurrences = [
  [160, 118],
  [181, 139],
  [198, 105],
  [217, 130],
  [238, 111],
  [256, 143],
  [276, 120],
] as const;

const desktopContours = [
  'M80 166C180 72 330 70 430 128C545 195 643 110 754 126C835 138 884 190 908 246',
  'M76 212C202 126 312 126 414 177C526 233 640 167 746 172C834 176 881 224 906 278',
  'M76 260C196 190 310 182 408 224C517 271 624 226 732 224C823 221 873 258 906 310',
  'M76 310C196 252 306 242 406 272C516 305 622 283 724 278C817 274 868 302 906 348',
  'M76 364C196 320 308 302 414 323C524 345 612 342 714 334C808 326 864 344 906 384',
] as const;

const mobileContours = [
  'M28 86C91 38 167 43 213 78C267 119 319 71 390 93',
  'M28 126C89 83 159 84 207 113C265 148 322 111 390 129',
  'M28 168C93 130 157 129 210 153C271 181 324 157 390 168',
  'M28 210C91 180 157 178 215 196C275 214 330 204 390 211',
] as const;

export const HeroSuitabilityMap: React.FC = () => {
  return (
    <div
      aria-label="Scientific atlas illustration showing habitat suitability, predictor coverage, and species occurrences"
      className="size-full"
      role="img"
    >
      <svg
        aria-hidden="true"
        className="hidden size-full lg:block"
        data-atlas-composition="desktop"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 960 560"
      >
        <defs>
          <linearGradient id="atlas-desktop-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--map-hero-sky-start)" />
            <stop offset="100%" stopColor="var(--map-hero-sky-end)" />
          </linearGradient>
          <linearGradient id="atlas-desktop-suitability" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--suitability-0)" />
            <stop offset="32%" stopColor="var(--suitability-1)" />
            <stop offset="58%" stopColor="var(--suitability-2)" />
            <stop offset="80%" stopColor="var(--suitability-3)" />
            <stop offset="100%" stopColor="var(--suitability-4)" />
          </linearGradient>
          <pattern height="40" id="atlas-desktop-grid" patternUnits="userSpaceOnUse" width="40">
            <path
              d="M40 0H0v40"
              fill="none"
              stroke="var(--primary)"
              strokeOpacity="0.14"
              strokeWidth="0.7"
            />
          </pattern>
          <clipPath id="atlas-desktop-study-area">
            <path d="M112 88H852V456H112Z" />
          </clipPath>
        </defs>

        <rect fill="url(#atlas-desktop-sky)" height="560" width="960" />
        <rect fill="url(#atlas-desktop-grid)" height="560" width="960" />
        <g clipPath="url(#atlas-desktop-study-area)">
          <path
            d="M44 400C169 314 258 350 354 288C448 226 526 249 604 198C696 138 804 176 928 104V560H44Z"
            fill="var(--suitability-1)"
            opacity="0.34"
          />
          <path
            d="M92 454C206 365 309 385 409 308C492 244 578 270 654 225C732 180 809 209 906 166V560H92Z"
            fill="var(--suitability-2)"
            opacity="0.48"
          />
          <path
            d="M170 482C270 402 361 410 449 337C526 274 602 302 674 258C746 214 816 241 890 215V560H170Z"
            fill="url(#atlas-desktop-suitability)"
            opacity="0.76"
          />
          <g fill="none" stroke="var(--foreground)" strokeOpacity="0.28" strokeWidth="1.2">
            {desktopContours.map((path) => (
              <path d={path} key={path} />
            ))}
          </g>
        </g>

        <path
          d="M112 88H852V456H112Z"
          fill="none"
          stroke="var(--primary)"
          strokeDasharray="8 6"
          strokeOpacity="0.72"
          strokeWidth="1.5"
        />
        <g data-atlas-element="occurrence-focus">
          <circle cx="528" cy="197" fill="var(--surface)" opacity="0.48" r="78" />
          <circle
            cx="528"
            cy="197"
            fill="none"
            r="58"
            stroke="var(--primary)"
            strokeDasharray="3 5"
            strokeOpacity="0.45"
          />
          {desktopOccurrences.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} fill="var(--foreground)" opacity="0.2" r="6" />
              <circle cx={x} cy={y} fill="var(--suitability-4)" r="3.5" />
            </g>
          ))}
        </g>

        <g data-atlas-element="desktop-labels" fontFamily="var(--font-mono)">
          <text fill="var(--muted-foreground)" fontSize="10" x="120" y="78">
            47.80°N · 6.20°E
          </text>
          <text fill="var(--muted-foreground)" fontSize="10" textAnchor="end" x="844" y="78">
            49.60°N · 9.40°E
          </text>
          <text fill="var(--foreground)" fontSize="10" x="557" y="157">
            OBSERVATION CLUSTER
          </text>
          <path d="M550 161 537 181" fill="none" stroke="var(--foreground)" strokeOpacity="0.6" />
        </g>

        <g
          data-atlas-composition-element="desktop"
          data-atlas-element="legend"
          transform="translate(64 482)"
        >
          <text fill="var(--foreground)" fontFamily="var(--font-mono)" fontSize="9" y="-10">
            SUITABILITY
          </text>
          <rect fill="url(#atlas-desktop-suitability)" height="8" rx="4" width="156" />
          <text fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="9" y="25">
            LOW 0
          </text>
          <text
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
            fontSize="9"
            textAnchor="end"
            x="156"
            y="25"
          >
            1 HIGH
          </text>
        </g>

        <g
          data-atlas-composition-element="desktop"
          data-atlas-element="scale"
          transform="translate(760 488)"
        >
          <text
            fill="var(--foreground)"
            fontFamily="var(--font-mono)"
            fontSize="10"
            textAnchor="middle"
            x="72"
            y="-16"
          >
            N
          </text>
          <path d="m68-10 4-5 4 5" fill="var(--foreground)" />
          <path d="M0 0H112M0-5V5m56-5v5m56-10V5" stroke="var(--foreground)" strokeWidth="1.4" />
          <text
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
            fontSize="9"
            textAnchor="middle"
            x="56"
            y="20"
          >
            50 KM
          </text>
        </g>
      </svg>

      <svg
        aria-hidden="true"
        className="block size-full lg:hidden"
        data-atlas-composition="mobile"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 420 360"
      >
        <defs>
          <linearGradient id="atlas-mobile-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--map-hero-sky-start)" />
            <stop offset="100%" stopColor="var(--map-hero-sky-end)" />
          </linearGradient>
          <linearGradient id="atlas-mobile-suitability" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--suitability-0)" />
            <stop offset="45%" stopColor="var(--suitability-2)" />
            <stop offset="100%" stopColor="var(--suitability-4)" />
          </linearGradient>
          <pattern height="30" id="atlas-mobile-grid" patternUnits="userSpaceOnUse" width="30">
            <path
              d="M30 0H0v30"
              fill="none"
              stroke="var(--primary)"
              strokeOpacity="0.13"
              strokeWidth="0.7"
            />
          </pattern>
          <clipPath id="atlas-mobile-study-area">
            <path d="M24 28H396V294H24Z" />
          </clipPath>
        </defs>

        <rect fill="url(#atlas-mobile-sky)" height="360" width="420" />
        <rect fill="url(#atlas-mobile-grid)" height="360" width="420" />
        <g clipPath="url(#atlas-mobile-study-area)">
          <path
            d="M0 284C80 225 138 250 201 194C258 144 310 168 420 94V360H0Z"
            fill="var(--suitability-1)"
            opacity="0.36"
          />
          <path
            d="M25 330C101 266 164 278 225 223C278 176 326 194 420 139V360H25Z"
            fill="url(#atlas-mobile-suitability)"
            opacity="0.72"
          />
          <g fill="none" stroke="var(--foreground)" strokeOpacity="0.26" strokeWidth="1">
            {mobileContours.map((path) => (
              <path d={path} key={path} />
            ))}
          </g>
        </g>
        <path
          d="M24 28H396V294H24Z"
          fill="none"
          stroke="var(--primary)"
          strokeDasharray="7 5"
          strokeOpacity="0.7"
          strokeWidth="1.2"
        />
        <g data-atlas-element="occurrence-focus">
          <circle cx="218" cy="124" fill="var(--surface)" opacity="0.5" r="58" />
          {mobileOccurrences.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} fill="var(--foreground)" opacity="0.2" r="5.5" />
              <circle cx={x} cy={y} fill="var(--suitability-4)" r="3.25" />
            </g>
          ))}
        </g>
        <text
          data-atlas-element="mobile-label"
          fill="var(--muted-foreground)"
          fontFamily="var(--font-mono)"
          fontSize="9"
          x="32"
          y="46"
        >
          STUDY AREA · 18,420 KM²
        </text>
        <g
          data-atlas-composition-element="mobile"
          data-atlas-element="legend"
          transform="translate(28 320)"
        >
          <rect fill="url(#atlas-mobile-suitability)" height="7" rx="3.5" width="122" />
          <text fill="var(--muted-foreground)" fontFamily="var(--font-mono)" fontSize="8.5" y="22">
            0 LOW
          </text>
          <text
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            textAnchor="end"
            x="122"
            y="22"
          >
            HIGH 1
          </text>
        </g>
        <g
          data-atlas-composition-element="mobile"
          data-atlas-element="scale"
          transform="translate(286 324)"
        >
          <path d="M0 0H96M0-4V4m48-4v4m48-4V4" stroke="var(--foreground)" strokeWidth="1.2" />
          <text
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
            fontSize="8.5"
            textAnchor="middle"
            x="48"
            y="20"
          >
            25 KM
          </text>
        </g>
      </svg>
    </div>
  );
};
