// The six exhibits — fixed order, temperature descends (SPEC §1).
export interface RoomMeta {
  id: string; // '1'..'6'
  key: string; // scene manager key: 'r1'..'r6'
  nameEn: string;
  nameZh: string;
  tempK: number; // numeric kelvin for readout
  tempLabel: string;
  lineEn: string;
  lineZh: string;
  tech: string[];
  hints: string;
  hintsZh: string;
  droneHz: number;
  countLabel?: string; // e.g. particle count
}

export const ATRIUM_TEMP_K = 293.15;

export const ROOMS: RoomMeta[] = [
  {
    id: '1', key: 'r1', nameEn: 'TURING', nameZh: '图灵',
    tempK: 273.15, tempLabel: '273.15 K',
    lineEn: 'Two chemicals, one rule, endless skin.',
    lineZh: '两种化学物，一条规则，无尽的皮肤。',
    tech: ['GRAY–SCOTT REACTION-DIFFUSION', 'GPU PING-PONG', 'HEIGHTFIELD LIGHTING'],
    hints: 'DRAG INJECT · SPACE RESET · KEYS 1–4 PRESETS',
    hintsZh: '拖动注入 · 空格重置 · 数字键 1–4 切换图案',
    droneHz: 110,
  },
  {
    id: '2', key: 'r2', nameEn: 'MERCURY', nameZh: '水银',
    tempK: 234.3, tempLabel: '234.3 K',
    lineEn: 'A mirror that forgot its shape.',
    lineZh: '一面忘了形状的镜子。',
    tech: ['RAYMARCHED SDF', 'SMOOTH UNION', 'PROCEDURAL STUDIO HDRI', 'DISPERSION'],
    hints: 'MOVE TO LURE · CLICK SHOCKWAVE',
    hintsZh: '移动鼠标牵引 · 点击产生冲击波',
    droneHz: 98,
  },
  {
    id: '3', key: 'r3', nameEn: 'CURL', nameZh: '旋度',
    tempK: 77.4, tempLabel: '77.4 K',
    lineEn: 'A million particles obey one equation.',
    lineZh: '百万粒子，服从同一个方程。',
    tech: ['GPGPU', 'CURL NOISE', 'STRANGE ATTRACTORS · AIZAWA / THOMAS / LORENZ'],
    hints: 'MOUSE ATTRACT · CLICK BURST · KEYS 1–4 MODES',
    hintsZh: '鼠标吸引 · 点击爆发 · 数字键 1–4 切换模式',
    droneHz: 87.3,
    countLabel: '',
  },
  {
    id: '4', key: 'r4', nameEn: 'LATTICE', nameZh: '晶格',
    tempK: 4.2, tempLabel: '4.2 K',
    lineEn: 'Order, rendered as weather.',
    lineZh: '秩序，被渲染成天气。',
    tech: ['INSTANCEDMESH ×40,000', 'VERTEX DISPLACEMENT', 'SHOCKWAVES', 'RIM LIGHT'],
    hints: 'CLICK SHOCKWAVE · DRAG ORBIT',
    hintsZh: '点击冲击波 · 拖动环绕',
    droneHz: 82.4,
  },
  {
    id: '5', key: 'r5', nameEn: 'ECHO', nameZh: '回声',
    tempK: 2.725, tempLabel: '2.725 K',
    lineEn: 'The oldest light, played as an instrument.',
    lineZh: '最古老的光，被演奏成乐器。',
    tech: ['WEB AUDIO SYNTH', 'FFT WATERFALL', 'OCCLUSION-LINE RENDERING'],
    hints: 'HOLD TO PLAY · X = PITCH · Y = FILTER / VOLUME',
    hintsZh: '按住发声 · X 控制音高 · Y 控制滤波与音量',
    droneHz: 0, // room 005 turns the drone off — it becomes the instrument
  },
  {
    id: '6', key: 'r6', nameEn: 'HORIZON', nameZh: '事件视界',
    tempK: 6.2e-8, tempLabel: '6.2×10⁻⁸ K',
    lineEn: 'Where light stops arguing.',
    lineZh: '光在此停止争辩。',
    tech: ['GEODESIC RAY BENDING', 'ACCRETION DISK', 'DOPPLER BEAMING', 'GRAVITATIONAL LENSING'],
    hints: 'DRAG ORBIT · WHEEL DISTANCE · MASS SLIDER',
    hintsZh: '拖动环绕 · 滚轮调节距离 · 滑块调节质量',
    droneHz: 55,
  },
];

export function roomByKey(key: string): RoomMeta | undefined {
  return ROOMS.find((r) => r.key === key);
}
export function roomById(id: string): RoomMeta | undefined {
  return ROOMS.find((r) => r.id === id);
}
