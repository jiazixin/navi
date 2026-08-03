import type { CatalogBackgroundPattern } from '../../shared/api/backgroundPattern';
import styles from './BackgroundPatternArtwork.module.css';

type BackgroundPatternArtworkProps = {
  pattern: CatalogBackgroundPattern;
  className?: string | undefined;
};

function MeridianGrid(): React.JSX.Element {
  return (
    <>
      <defs>
        <pattern id="navi-meridian-minor" width="96" height="48" patternUnits="userSpaceOnUse">
          <path className={styles.faint} d="M96 0H0V48" />
        </pattern>
        <pattern id="navi-meridian-major" width="384" height="192" patternUnits="userSpaceOnUse">
          <path className={styles.secondary} d="M384 0H0V192" />
        </pattern>
      </defs>
      <g className={styles.meridianField} data-pattern-motion="meridian-field">
        <rect x="-24" y="-24" width="1488" height="948" fill="url(#navi-meridian-minor)" />
        <rect x="-24" y="-24" width="1488" height="948" fill="url(#navi-meridian-major)" />
        <path className={styles.faint} d="M0 900 720 450 1440 900M0 0 720 450 1440 0" />
      </g>
      <g className={styles.meridianAxis} data-pattern-motion="meridian-axis">
        <path className={styles.secondary} d="M720 0V900M0 450H1440" />
        <circle className={styles.primary} cx="720" cy="450" r="116" />
      </g>
      <g className={styles.meridianProbe} data-pattern-motion="meridian-probe">
        <circle className={styles.node} cx="720" cy="334" r="4" />
      </g>
      <circle className={styles.node} cx="720" cy="450" r="4" />
    </>
  );
}

function OrbitalRings(): React.JSX.Element {
  return (
    <>
      <path className={styles.faint} d="M72 760C360 510 1080 510 1368 760M120 180C440 420 1000 420 1320 180" />
      <g className={styles.orbitPlanePrimary} data-pattern-motion="orbital-primary-plane">
        <ellipse className={styles.primary} cx="720" cy="450" rx="418" ry="196" />
      </g>
      <g className={styles.orbitPlaneSecondary} data-pattern-motion="orbital-secondary-plane">
        <ellipse className={styles.secondary} cx="720" cy="450" rx="276" ry="372" transform="rotate(38 720 450)" />
        <ellipse className={styles.secondary} cx="720" cy="450" rx="520" ry="126" transform="rotate(-18 720 450)" />
      </g>
      <circle className={styles.faint} cx="720" cy="450" r="300" />
      <circle className={styles.primary} cx="720" cy="450" r="72" />
      <path className={styles.faint} d="M720 68V832M208 450H1232" />
      <g className={styles.orbitBodyOuter} data-pattern-motion="orbital-outer-body">
        <circle className={styles.node} cx="331" cy="522" r="5" />
      </g>
      <g className={styles.orbitBodyPolar} data-pattern-motion="orbital-polar-body">
        <circle className={styles.node} cx="720" cy="150" r="4" />
      </g>
      <g className={styles.orbitBodyInner} data-pattern-motion="orbital-inner-body">
        <circle className={styles.node} cx="1060" cy="307" r="6" />
      </g>
      <g className={styles.orbitBodyReverse} data-pattern-motion="orbital-reverse-body">
        <circle className={styles.node} cx="914" cy="684" r="4" />
      </g>
      <circle className={styles.node} cx="720" cy="450" r="5" />
    </>
  );
}

function Pisces(): React.JSX.Element {
  return (
    <>
      <circle className={styles.faint} cx="720" cy="450" r="336" />
      <path className={styles.secondary} d="M384 450C498 216 942 216 1056 450C942 684 498 684 384 450Z" />
      <g className={styles.piscesLeftFish} data-pattern-motion="pisces-left-fish">
        <path className={styles.primary} d="M430 360C508 286 614 286 680 360C614 434 508 434 430 360Z" />
        <path
          className={[styles.primary, styles.piscesLeftTail].join(' ')}
          d="m430 360-84-62 26 62-26 62 84-62Z"
          data-pattern-motion="pisces-left-tail"
        />
        <circle className={styles.node} cx="630" cy="346" r="5" />
      </g>
      <g className={styles.piscesRightFish} data-pattern-motion="pisces-right-fish">
        <path className={styles.primary} d="M1010 540C932 614 826 614 760 540C826 466 932 466 1010 540Z" />
        <path
          className={[styles.primary, styles.piscesRightTail].join(' ')}
          d="m1010 540 84 62-26-62 26-62-84 62Z"
          data-pattern-motion="pisces-right-tail"
        />
        <circle className={styles.node} cx="810" cy="554" r="5" />
      </g>
      <path
        className={[styles.faint, styles.piscesConstellation].join(' ')}
        d="M630 346 720 270 810 554 720 630 630 346"
        data-pattern-motion="pisces-constellation"
      />
      <circle className={styles.node} cx="720" cy="270" r="4" />
      <circle className={styles.node} cx="720" cy="630" r="4" />
      <circle className={styles.node} cx="384" cy="450" r="4" />
      <circle className={styles.node} cx="1056" cy="450" r="4" />
    </>
  );
}

function Sagittarius(): React.JSX.Element {
  return (
    <>
      <circle className={styles.faint} cx="720" cy="450" r="350" />
      <g className={styles.sagittariusBow} data-pattern-motion="sagittarius-bow">
        <path className={styles.primary} d="M430 690C644 662 842 452 976 210" />
        <path className={styles.secondary} d="M430 690C540 448 760 270 976 210" />
      </g>
      <g className={styles.sagittariusArrow} data-pattern-motion="sagittarius-arrow">
        <path className={styles.secondary} d="M430 690 976 210" />
        <path className={styles.primary} d="m976 210-88 18 54 22 16 56 18-96Z" />
        <path className={styles.secondary} d="m622 522 62 70M594 546l62 70" />
      </g>
      <g className={styles.sagittariusStars} data-pattern-motion="sagittarius-stars">
        <polyline className={styles.faint} points="412,254 540,334 648,286 748,372 854,330 1018,438 936,552 1070,644" />
        <circle className={styles.node} cx="412" cy="254" r="4" />
        <circle className={styles.node} cx="540" cy="334" r="5" />
        <circle className={styles.node} cx="648" cy="286" r="4" />
        <circle className={styles.node} cx="748" cy="372" r="5" />
        <circle className={styles.node} cx="854" cy="330" r="4" />
        <circle className={styles.node} cx="1018" cy="438" r="5" />
        <circle className={styles.node} cx="936" cy="552" r="4" />
        <circle className={styles.node} cx="1070" cy="644" r="5" />
      </g>
    </>
  );
}

function RomanMeander(): React.JSX.Element {
  return (
    <>
      <defs>
        <pattern id="navi-roman-meander" width="288" height="216" patternUnits="userSpaceOnUse">
          <path className={styles.secondary} d="M0 36h216v108H72V90h72M288 180H72V72h144v54h-72" />
          <path className={styles.faint} d="M0 0H288M0 216H288" />
        </pattern>
      </defs>
      <rect
        className={styles.meanderFlow}
        data-pattern-motion="roman-meander-flow"
        x="-288"
        width="2016"
        height="900"
        fill="url(#navi-roman-meander)"
      />
      <path className={styles.primary} d="M0 154H1440M0 746H1440" />
      <path className={styles.faint} d="M240 0V900M720 0V900M1200 0V900" />
      <circle className={styles.node} cx="240" cy="154" r="4" />
      <circle className={styles.node} cx="720" cy="746" r="4" />
      <circle className={styles.node} cx="1200" cy="154" r="4" />
    </>
  );
}

function RoseWindow(): React.JSX.Element {
  const petalPath = 'M720 450C650 372 654 288 720 188C786 288 790 372 720 450Z';
  return (
    <>
      <g className={styles.faint}>
        <circle cx="720" cy="450" r="356" />
        <circle cx="720" cy="450" r="262" />
        <circle cx="720" cy="450" r="124" />
      </g>
      <g className={[styles.primary, styles.rosePetals].join(' ')} data-pattern-motion="rose-petals">
        {Array.from({ length: 12 }, (_, index) => (
          <path d={petalPath} key={index} transform={`rotate(${index * 30} 720 450)`} />
        ))}
      </g>
      <g className={[styles.secondary, styles.roseSpokes].join(' ')} data-pattern-motion="rose-spokes">
        <path d="M364 450H1076M720 94V806M468 198l504 504M972 198 468 702" />
      </g>
      <circle className={styles.node} cx="720" cy="450" r="6" />
      <g className={styles.roseNodes} data-pattern-motion="rose-nodes">
        <circle className={styles.node} cx="720" cy="188" r="4" />
        <circle className={styles.node} cx="982" cy="450" r="4" />
        <circle className={styles.node} cx="720" cy="712" r="4" />
        <circle className={styles.node} cx="458" cy="450" r="4" />
      </g>
    </>
  );
}

function EightPointStar(): React.JSX.Element {
  return (
    <>
      <defs>
        <pattern id="navi-eight-point-star" width="288" height="240" patternUnits="userSpaceOnUse">
          <path className={styles.primary} d="m144 28 24 68 68 24-68 24-24 68-24-68-68-24 68-24 24-68Z" />
          <path className={styles.secondary} d="m144 58 62 62-62 62-62-62 62-62ZM0 0l82 82M288 0l-82 82M0 240l82-58M288 240l-82-58" />
          <circle className={styles.node} cx="144" cy="120" r="3" />
        </pattern>
      </defs>
      <rect
        className={styles.eightPointFlow}
        data-pattern-motion="eight-point-flow"
        x="-288"
        y="-240"
        width="2016"
        height="1380"
        fill="url(#navi-eight-point-star)"
      />
      <path className={styles.faint} d="M0 450H1440M720 0V900" />
    </>
  );
}

function StarTrails(): React.JSX.Element {
  const trailCenter = { x: 90, y: 950 } as const;
  const guideRadii = [160, 240, 330, 430, 540, 660, 780] as const;

  return (
    <>
      <g
        className={styles.starTrailsField}
        data-pattern-motion="star-trails-field"
        data-star-trails-origin={`${trailCenter.x} ${trailCenter.y}`}
      >
        {guideRadii.map((radius) => (
          <circle
            className={[styles.faint, styles.starTrailsGuide].join(' ')}
            cx={trailCenter.x}
            cy={trailCenter.y}
            key={radius}
            r={radius}
          />
        ))}
      </g>
      <g
        className={[styles.primary, styles.starTrailsSlow].join(' ')}
        data-pattern-motion="star-trails-slow"
      >
        <circle cx={trailCenter.x} cy={trailCenter.y} r="240" />
        <circle cx={trailCenter.x} cy={trailCenter.y} r="540" />
        <circle cx={trailCenter.x} cy={trailCenter.y} r="780" />
      </g>
      <g
        className={[styles.secondary, styles.starTrailsMedium].join(' ')}
        data-pattern-motion="star-trails-medium"
      >
        <circle cx={trailCenter.x} cy={trailCenter.y} r="160" />
        <circle cx={trailCenter.x} cy={trailCenter.y} r="430" />
        <circle cx={trailCenter.x} cy={trailCenter.y} r="660" />
      </g>
      <g
        className={[styles.primary, styles.starTrailsFast].join(' ')}
        data-pattern-motion="star-trails-fast"
      >
        <circle cx={trailCenter.x} cy={trailCenter.y} r="330" />
        <circle cx={trailCenter.x} cy={trailCenter.y} r="620" />
      </g>
      <g className={styles.starTrailsStars} data-pattern-motion="star-trails-stars">
        <circle className={styles.node} cx="164" cy="722" r="3" />
        <circle className={styles.node} cx="410" cy="662" r="4" />
        <circle className={styles.node} cx="390" cy="362" r="3.5" />
        <circle className={styles.node} cx="779" cy="584" r="4.5" />
      </g>
    </>
  );
}

function PatternGeometry({ pattern }: { pattern: CatalogBackgroundPattern }): React.JSX.Element | null {
  switch (pattern) {
    case 'none':
      return null;
    case 'meridian-grid':
      return <MeridianGrid />;
    case 'orbital-rings':
      return <OrbitalRings />;
    case 'pisces':
      return <Pisces />;
    case 'sagittarius':
      return <Sagittarius />;
    case 'roman-meander':
      return <RomanMeander />;
    case 'rose-window':
      return <RoseWindow />;
    case 'eight-point-star':
      return <EightPointStar />;
    case 'star-trails':
      return <StarTrails />;
  }
}

export function BackgroundPatternArtwork({
  pattern,
  className,
}: BackgroundPatternArtworkProps): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={[styles.artwork, className].filter(Boolean).join(' ')}
      data-pattern-artwork={pattern}
      focusable="false"
      preserveAspectRatio={pattern === 'star-trails' ? 'xMinYMax slice' : 'xMidYMid slice'}
      viewBox="0 0 1440 900"
      xmlns="http://www.w3.org/2000/svg"
    >
      <PatternGeometry pattern={pattern} />
    </svg>
  );
}
