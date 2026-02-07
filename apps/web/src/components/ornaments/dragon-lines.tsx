import { cn } from '~/lib/utils';

type DragonLine = {
  d: string;
  opacity: number;
  dash?: string;
};

const dragonSketchLines: DragonLine[] = [
  {
    d: 'M0 140 C180 40 420 40 620 160 C860 300 1180 320 1540 240 C1680 210 1760 170 1800 140',
    opacity: 0.5,
  },
  {
    d: 'M0 240 C220 160 520 150 760 260 C1000 370 1280 380 1600 300 C1700 270 1760 250 1800 230',
    opacity: 0.35,
  },
  {
    d: 'M0 340 C260 300 560 310 820 380 C1060 440 1340 450 1680 390 C1740 380 1780 370 1800 360',
    opacity: 0.3,
  },
  { d: 'M120 90 C320 160 420 210 620 250', opacity: 0.25 },
  { d: 'M980 90 C1160 150 1340 230 1540 290', opacity: 0.25 },
  {
    d: 'M0 430 C260 410 520 430 820 480 C1100 520 1440 520 1800 480',
    opacity: 0.2,
    dash: '8 14',
  },
];

type DragonLinesProps = {
  className?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
};

const lineToneClass = 'text-amber-700/30 dark:text-amber-200/25';
const baseSvgClass =
  'dragon-drift absolute left-1/2 w-[120vw] -translate-x-1/2';

export function DragonLines({
  className,
  primaryClassName,
  secondaryClassName,
}: DragonLinesProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden',
        className
      )}
      aria-hidden="true"
    >
      <svg
        className={cn(
          `${baseSvgClass} top-[-120px] h-[360px] opacity-70`,
          primaryClassName
        )}
        viewBox="0 0 1800 520"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g
          className={lineToneClass}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {dragonSketchLines.map((line, index) => (
            <path
              key={`dragon-line-primary-${index}`}
              d={line.d}
              opacity={line.opacity}
              strokeDasharray={line.dash}
            />
          ))}
        </g>
      </svg>
      <svg
        className={cn(
          `${baseSvgClass} top-[120px] h-[320px] opacity-50`,
          secondaryClassName
        )}
        viewBox="0 0 1800 520"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        style={{ animationDelay: '4s' }}
      >
        <g
          className={lineToneClass}
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(1800 0) scale(-1 1)"
        >
          {dragonSketchLines.map((line, index) => (
            <path
              key={`dragon-line-secondary-${index}`}
              d={line.d}
              opacity={line.opacity}
              strokeDasharray={line.dash}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
