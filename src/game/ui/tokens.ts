// Design tokens: docs/design/visual-language.md sections 4, 7, 8, 10, 11, 13 and 16.4 to 16.6.
// Every measured value keeps its guide name; values Teggle chose itself are marked "Teggle".
// Units are world units (one original pixel) unless a name says otherwise.

export const color = {
  // Machine materials (16.4, 10.1).
  // Brass sampled along the original column frame: warm gold shading into copper.
  brassHi: '#ffefcd',
  brassLight: '#e8c47c',
  brass: '#d3aa5c',
  brassMid: '#c0904a',
  brassDeep: '#a86e38',
  brassLo: '#6e4422',
  brassOutline: '#3e2410',
  copper: '#b0703c',
  tealLip: '#74a4ae',
  tealLipDark: '#40808c',
  tealDeep: '#1d4d55',
  counterBody: '#006744',
  counterEmpty: '#015146',
  counterEmptyDeep: '#003b37',
  meterOff: '#41080e',
  meterOffEdge: '#963f21',
  meterOn: '#ed9555',
  meterOnEdge: '#e24d09',
  meterGroove: '#3f142f',
  tubeGreen: '#8fffc9',
  tubeGreenEdge: '#35cd76',
  tubePurple: '#e995ff',
  tubePurpleEdge: '#a632cb',
  tubeYellow: '#ffef77',
  tubeYellowEdge: '#d9b81c',

  // Panels and windows.
  panel: '#25137f',
  panelScanline: '#1d0f64',
  panelBevel: '#47319e',
  panelBevelLo: '#312d81',
  titlePillTop: '#4157bc',
  titlePillMid: '#0716e1',
  titlePillBottom: '#095de3',
  scoreWindowTop: '#4154ba',
  scoreWindowMid: '#0716e1',
  scoreWindowBottom: '#095de3',
  scoreWindowRim: '#2b8c9c',

  // Text (8.3, 16.4).
  textScore: '#7decff',
  textScoreLow: '#3f92fa',
  textScoreOutline: '#0040c0',
  textLabel: '#5cc5f8',
  textBallCount: '#9bf633',
  textBallCountLow: '#3fbf1a',
  textBallCountGlow: '#0b3d12',
  textValue: '#f3e525',
  textTally: '#eff314',
  textRowLabel: '#6ce1e2',
  textStats: '#d2c78d',
  textStyleShot: '#7ce47c',
  textStyleShotHi: '#a0ff9e',
  textStyleOutline: '#0d3a0c',
  textStylePoints: '#92fc9a',
  textBonusPink: '#dd83dc',
  textBonusPinkHi: '#fd94fe',
  textPegValue: '#eee923',
  textWarnTop: '#fcfe03',
  textWarnMid: '#fee300',
  textWarnLow: '#fd9c00',
  textWarnBottom: '#fc4c00',
  textTitleTop: '#6ee5ff',
  textTitleLow: '#4da6cc',
  textTitleOutline: '#1a1aa6',
  textButton: '#f9d054',
  textButtonBlue: '#c9f3ff',
  textBody: '#e8e4d0',
  outline: '#000000',

  // Buttons (10.2).
  btnOrange: '#b3360d',
  btnOrangeLo: '#f67f37',
  btnOrangeHover: '#e8790d',
  btnOrangeHoverLo: '#ffc937',
  btnOrangeDown: '#f3d716',
  btnOrangeDownLo: '#fdff37',
  btnBlue: '#0207ea',
  btnBlueHover: '#006eea',
  btnSelected: '#1cba53',
  btnBrown: '#6e2400',
  btnBrownLo: '#9b4200',
  btnBrownHover: '#f1a034',
  btnBrownDown: '#f0ca03',
  btnRim: '#79abb5',
  btnRimDark: '#3d6f7a',
  gelGreen: '#0b5835',
  gelGreenRim: '#b9e728',
  gelGreenHover: '#a4ec29',
  gelGreenHi: '#e6fe86',
  roundPurple: '#a900bc',
  roundPurpleHover: '#ec28ca',
  roundGreen: '#0e8f2a',
  roundGreenHover: '#36d34f',
  arrowGreen: '#006c0c',
  arrowGreenHover: '#02d720',
  arrowInk: '#c8e60a',
  arrowInkHover: '#f2ff00',
  disabled: '#5a6470',

  // Ball (5.1).
  ballSkyDeep: '#396d92',
  ballSky: '#6492b4',
  ballSkyLight: '#a3c6d6',
  ballHorizon: '#7e4303',
  ballGold: '#987d24',
  ballGoldLight: '#c9b25a',
  ballRim: '#774721',

  // Aim guide (5.3).
  guideDot: '#6fcab7',
  guideDotHot: '#8bfeff',
  guideHit: '#fdf000',

  // Rainbow (12.5).
  rainbow: ['#e5280b', '#fb9326', '#ffed42', '#98fe37', '#28d8fc', '#284bff', '#6714ff'],
} as const;

export type PegColor = 'blue' | 'orange' | 'purple' | 'green';
export const PEG_COLORS: readonly PegColor[] = ['blue', 'orange', 'purple', 'green'];

/** Round peg layers from the outside in (4.2): outline, metal rim, inner ring, body, specular. */
export interface PegPalette {
  readonly outline: string;
  readonly rimHi: string;
  readonly rimLo: string;
  readonly ringHi: string;
  readonly ringLo: string;
  readonly bodyTop: string;
  readonly bodyBottom: string;
  readonly specular: string;
}

export const pegPalette: Record<PegColor, { normal: PegPalette; lit: PegPalette }> = {
  blue: {
    normal: {
      outline: '#1b2646',
      rimHi: '#9fb4dd',
      rimLo: '#677ba6',
      ringHi: '#162a68',
      ringLo: '#0e2158',
      bodyTop: '#3b55a1',
      bodyBottom: '#1b307d',
      specular: '#e1fbff',
    },
    lit: {
      outline: '#0f2595',
      rimHi: '#3f86f0',
      rimLo: '#325dd1',
      ringHi: '#448cca',
      ringLo: '#04388c',
      bodyTop: '#ceffff',
      bodyBottom: '#5cabdb',
      specular: '#ffffff',
    },
  },
  orange: {
    normal: {
      outline: '#4a2d13',
      rimHi: '#e2bb7d',
      rimLo: '#af8a56',
      ringHi: '#7f2b10',
      ringLo: '#682a0a',
      bodyTop: '#e05a35',
      bodyBottom: '#a83a22',
      specular: '#f9e7b9',
    },
    lit: {
      outline: '#89190e',
      rimHi: '#f08b55',
      rimLo: '#be4a2c',
      ringHi: '#d0691d',
      ringLo: '#a03504',
      bodyTop: '#fafabc',
      bodyBottom: '#f8a44d',
      specular: '#ffffff',
    },
  },
  purple: {
    normal: {
      outline: '#49194c',
      rimHi: '#d993dd',
      rimLo: '#af64b4',
      ringHi: '#7a0875',
      ringLo: '#690c69',
      bodyTop: '#d52fcb',
      bodyBottom: '#9a1291',
      specular: '#ffdfff',
    },
    lit: {
      outline: '#751993',
      rimHi: '#c775e2',
      rimLo: '#a845ca',
      ringHi: '#bc3bbe',
      ringLo: '#710b85',
      bodyTop: '#fdf1fd',
      bodyBottom: '#df61d9',
      specular: '#ffffff',
    },
  },
  green: {
    normal: {
      outline: '#174214',
      rimHi: '#8fd685',
      rimLo: '#5da554',
      ringHi: '#0b6908',
      ringLo: '#085605',
      bodyTop: '#20c018',
      bodyBottom: '#127e0d',
      specular: '#cafeb6',
    },
    lit: {
      outline: '#126913',
      rimHi: '#5fcc5f',
      rimLo: '#40a444',
      ringHi: '#7fc239',
      ringLo: '#1a7106',
      bodyTop: '#f7ffde',
      bodyBottom: '#b1e35a',
      specular: '#ffffff',
    },
  },
};

/** Lit glow tint per color (glow.peg = lit edge color, 16.6). */
export const pegGlow: Record<PegColor, string> = {
  blue: '#3f9bff',
  orange: '#ff8a2a',
  purple: '#e25ee6',
  green: '#7ee04a',
};

/**
 * Brick material (4.3): a beveled frame around a recessed pill. Stops run across the thickness
 * from the facing side (0) to the back side (1). Teggle's own simplified stops, keyed to the
 * guide's measured colors.
 */
export interface BrickPalette {
  readonly outline: string;
  readonly bevel: readonly (readonly [number, string])[];
  readonly endBevel: string;
  readonly line: string;
  readonly pill: readonly (readonly [number, string])[];
}

export const brickPalette: Record<PegColor, { normal: BrickPalette; lit: BrickPalette }> = {
  blue: {
    normal: {
      outline: '#03050c',
      bevel: [
        [0, '#93c0ff'],
        [0.1, '#e4f0ff'],
        [0.2, '#bcdbff'],
        [0.5, '#6f9eef'],
        [0.8, '#4f78d6'],
        [1, '#537cd9'],
      ],
      endBevel: '#86b5fe',
      line: '#000000',
      pill: [
        [0, '#3052ad'],
        [0.18, '#aac9fd'],
        [0.32, '#3c5fc0'],
        [0.55, '#0d32a7'],
        [0.8, '#092179'],
        [1, '#283f87'],
      ],
    },
    lit: {
      outline: '#000d0d',
      bevel: [
        [0, '#0065ff'],
        [0.12, '#1dbcff'],
        [0.5, '#0087ff'],
        [1, '#0026ff'],
      ],
      endBevel: '#0069ff',
      line: '#1c14ee',
      pill: [
        [0, '#4cdeff'],
        [0.35, '#bffdff'],
        [0.5, '#d8feff'],
        [0.7, '#9bf7ff'],
        [1, '#4adeff'],
      ],
    },
  },
  orange: {
    normal: {
      outline: '#170a02',
      bevel: [
        [0, '#f7be60'],
        [0.1, '#fbe9ad'],
        [0.2, '#facd7f'],
        [0.5, '#f6b960'],
        [0.8, '#f29c2a'],
        [1, '#d78120'],
      ],
      endBevel: '#f4b05b',
      line: '#000000',
      pill: [
        [0, '#e73e20'],
        [0.18, '#fcd8c4'],
        [0.32, '#f98c3c'],
        [0.55, '#b92e09'],
        [0.8, '#7d2307'],
        [1, '#b7330b'],
      ],
    },
    lit: {
      outline: '#2a2911',
      bevel: [
        [0, '#d85f2c'],
        [0.12, '#ffb253'],
        [0.5, '#ffcd56'],
        [1, '#cf522a'],
      ],
      endBevel: '#fa4d28',
      line: '#b44103',
      pill: [
        [0, '#ffd063'],
        [0.35, '#fff9b8'],
        [0.5, '#fffbd7'],
        [0.7, '#ffdd87'],
        [1, '#ffaf2b'],
      ],
    },
  },
  purple: {
    normal: {
      outline: '#080308',
      bevel: [
        [0, '#eb83ff'],
        [0.1, '#fed2f7'],
        [0.2, '#edabff'],
        [0.5, '#cf2cd7'],
        [0.8, '#c412c5'],
        [1, '#c714c9'],
      ],
      endBevel: '#e973ff',
      line: '#000000',
      pill: [
        [0, '#ce01cb'],
        [0.18, '#f389ff'],
        [0.32, '#f21af0'],
        [0.55, '#c200ba'],
        [0.8, '#780069'],
        [1, '#9e0095'],
      ],
    },
    lit: {
      outline: '#362f2d',
      bevel: [
        [0, '#9646ad'],
        [0.12, '#d282fe'],
        [0.5, '#ebaff7'],
        [1, '#9646ad'],
      ],
      endBevel: '#b041f3',
      line: '#4b028f',
      pill: [
        [0, '#ff9afe'],
        [0.35, '#fbc0fe'],
        [0.5, '#fdddfd'],
        [0.7, '#fa80f9'],
        [1, '#f51bde'],
      ],
    },
  },
  green: {
    normal: {
      outline: '#020702',
      bevel: [
        [0, '#6cf15c'],
        [0.1, '#c0ffa2'],
        [0.2, '#98f56b'],
        [0.5, '#8df45b'],
        [0.8, '#1dd620'],
        [1, '#21d823'],
      ],
      endBevel: '#5af44b',
      line: '#000000',
      pill: [
        [0, '#079d00'],
        [0.18, '#92ff5c'],
        [0.32, '#09bb00'],
        [0.55, '#018000'],
        [0.8, '#005c01'],
        [1, '#039200'],
      ],
    },
    lit: {
      outline: '#202e0c',
      bevel: [
        [0, '#40c446'],
        [0.12, '#6aea35'],
        [0.5, '#a0f03f'],
        [1, '#40a847'],
      ],
      endBevel: '#3ebf47',
      line: '#0f7001',
      pill: [
        [0, '#a9ee0c'],
        [0.35, '#efffbe'],
        [0.5, '#f9ffe4'],
        [0.7, '#d1fa69'],
        [1, '#b2f12f'],
      ],
    },
  },
};

/**
 * Master color themes (section 13). `pipe` is the enamel ring color on the corner pieces,
 * measured from `pak/images/ip/TLC.jp2` (row center of the curved pipe); Teggle draws its own
 * emblem per master instead of the original's.
 */
export interface Theme {
  readonly index: number;
  readonly master: string;
  readonly power: string;
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  readonly glow: string;
  readonly pipe: string;
}

export const THEMES: readonly Theme[] = [
  {
    index: 0,
    master: 'Unicorn',
    power: 'Guide',
    base: '#3f81e2',
    light: '#79a6eb',
    dark: '#1c3989',
    glow: '#52dbff',
    pipe: '#00a1d7',
  },
  {
    index: 1,
    master: 'Gopher',
    power: 'Multiball',
    base: '#75b638',
    light: '#81c03c',
    dark: '#364e1a',
    glow: '#49f300',
    pipe: '#26b932',
  },
  {
    index: 2,
    master: 'Cat',
    power: 'Pyramid',
    base: '#e89e19',
    light: '#dec32c',
    dark: '#7c400c',
    glow: '#ff8a00',
    pipe: '#d3cd03',
  },
  {
    index: 3,
    master: 'Alien',
    power: 'Space Blast',
    base: '#a826eb',
    light: '#d287f4',
    dark: '#440d9c',
    glow: '#b516ff',
    pipe: '#bf23cd',
  },
  {
    index: 4,
    master: 'Lobster',
    power: 'Flippers',
    base: '#11d8ef',
    light: '#8ceafd',
    dark: '#0362a4',
    glow: '#007eff',
    pipe: '#6ddfce',
  },
  {
    index: 5,
    master: 'Pumpkin',
    power: 'Spooky Ball',
    base: '#571023',
    light: '#8a4356',
    dark: '#240513',
    glow: '#aba6e6',
    pipe: '#a7abd4',
  },
  {
    index: 6,
    master: 'Sunflower',
    power: 'Flower Power',
    base: '#e26db6',
    light: '#fd9bd5',
    dark: '#ba569d',
    glow: '#ff62fd',
    pipe: '#ffcee6',
  },
  {
    index: 7,
    master: 'Rabbit',
    power: 'Lucky Spin',
    base: '#d80801',
    light: '#d7817b',
    dark: '#770403',
    glow: '#ff0005',
    pipe: '#ea74e9',
  },
  {
    index: 8,
    master: 'Wyvern',
    power: 'Fireball',
    base: '#f1bc00',
    light: '#f6c803',
    dark: '#a85600',
    glow: '#ffb400',
    pipe: '#c70031',
  },
  {
    index: 9,
    master: 'Owl',
    power: 'Zen Ball',
    base: '#dae7eb',
    light: '#e0f2f6',
    dark: '#627484',
    glow: '#c5ddff',
    pipe: '#3b5dfe',
  },
];

export function themeAt(index: number): Theme {
  const n = THEMES.length;
  const t = THEMES[((Math.trunc(index) % n) + n) % n];
  if (t === undefined) throw new Error('THEMES is empty');
  return t;
}

// Typography (8.4, 16.5). Sizes are cap heights in world units; text.ts converts them to a
// font size with the face's measured cap ratio.
export const FONT_DISPLAY = 'Overload';
/** Overload with its squared A and E alternates as the default (docs/assets.md). */
export const FONT_DISPLAY_CAPS = 'Overload Caps';
export const FONT_BODY = 'Exo 2';
/** Used when a webfont fails to load: heavy, squarish system faces. */
export const FONT_DISPLAY_FALLBACK = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
export const FONT_BODY_FALLBACK = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export const type = {
  score: 22,
  label: 9,
  ballCount: 31,
  pegValue: 9,
  callout: 13,
  shotTotalSmall: 13,
  shotTotalLarge: 20,
  stylePoints: 12,
  warning: 20,
  warningHuge: 95,
  title: 18,
  rowLabel: 13,
  rowValue: 12,
  button: 10,
  body: 12,
  bigNumber: 48,
} as const;

export const shape = {
  strokeUi: 1,
  panelRadius: 20,
  panelInnerRadius: 10,
  thumbRadius: 12,
  shadowObject: { dx: -4, dy: 3, alpha: 0.45 },
  /** Frame inner shadow alpha by distance from the edge (16.6). */
  frameShadow: [
    [0, 1],
    [5, 0.54],
    [10, 0.26],
    [20, 0],
  ] as const,
  pegGlowRadius: 24,
} as const;

export const motion = {
  popPeakScale: 1.85,
  popPeakMs: 80,
  popSettleMs: 250,
  popHoldMs: 600,
  popFadeMs: 350,
  dialogDropMs: 170,
  pegRemoveStepMs: 42,
  bucketPeakSpeed: 272,
  feverZoom: [1.5, 2.0],
  /** Fast forward while held (spec 4). */
  fastForward: 8,
  /** Original slow motion default (research 4.7). */
  slowMotion: 0.25,
} as const;
