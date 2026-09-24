/**
 * Builds a simple stylized "back view" basketball player SVG for each of the
 * four selectable characters. Original vector art (not the reference photos
 * in /assets, which are third-party screenshots used only as a layout guide).
 */
const AVATAR_PRESETS = {
  boy_dark: {
    label: 'Player 1',
    skin: '#f0b98d',
    hair: '#2e2118',
    jersey: '#2f6fed',
    jerseyTrim: '#e7edff',
    bottom: '#182449',
    number: '7',
    hairStyle: 'short',
    bottomStyle: 'shorts',
  },
  boy_blonde: {
    label: 'Player 2',
    skin: '#f3c39a',
    hair: '#e0b563',
    jersey: '#e0483e',
    jerseyTrim: '#ffe9d6',
    bottom: '#2b2b2b',
    number: '23',
    hairStyle: 'short',
    bottomStyle: 'shorts',
  },
  girl_dark: {
    label: 'Player 3',
    skin: '#f0b98d',
    hair: '#33241a',
    jersey: '#a83be0',
    jerseyTrim: '#f6e6ff',
    bottom: '#2a1f3d',
    number: '10',
    hairStyle: 'pony',
    bottomStyle: 'skirt',
  },
  girl_blonde: {
    label: 'Player 4',
    skin: '#f3c39a',
    hair: '#e0c168',
    jersey: '#17b3a3',
    jerseyTrim: '#daffF7',
    bottom: '#0d3d38',
    number: '11',
    hairStyle: 'pony',
    bottomStyle: 'skirt',
  },
};

function shade(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(255 * (percent / 100));
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00ff) + amt;
  let b = (num & 0x0000ff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function buildAvatarSVG(characterId) {
  const p = AVATAR_PRESETS[characterId] || AVATAR_PRESETS.boy_dark;

  const hair = p.hairStyle === 'pony'
    ? `<ellipse cx="120" cy="52" rx="40" ry="36" fill="${p.hair}"/>
       <path d="M107,47
                C113,60 119,68 116,80
                C113,94 105,106 108,119
                C111,133 121,145 118,158
                C116,169 111,181 114,192
                C116,201 119,208 121,215
                C124,209 127,202 123,193
                C120,182 127,170 132,159
                C137,146 124,134 127,120
                C130,106 141,95 138,81
                C135,68 128,60 132,47
                C126,42 113,42 107,47 Z"
             fill="${p.hair}"/>
       <path d="M116,56 C124,72 128,90 121,108 C116,124 124,140 118,156 C114,168 119,182 113,196"
             fill="none" stroke="${shade(p.hair, 24)}" stroke-width="3.5" stroke-linecap="round" opacity="0.45"/>
       <ellipse cx="120" cy="49" rx="10" ry="4" fill="${shade(p.hair, -6)}" opacity="0.55"/>`
    : `<ellipse cx="120" cy="52" rx="40" ry="35" fill="${p.hair}"/>
       <path d="M82,50 Q90,20 120,20 Q150,20 158,50 Q150,38 120,36 Q90,38 82,50 Z" fill="${p.hair}"/>`;

  const bottom = p.bottomStyle === 'skirt'
    ? `<path d="M78,205 L162,205 L172,246 Q120,258 68,246 Z" fill="${p.bottom}"/>`
    : `<path d="M78,205 L162,205 L158,244 L124,244 L120,222 L116,244 L82,244 Z" fill="${p.bottom}"/>`;

  const legsTopY = p.bottomStyle === 'skirt' ? 246 : 244;

  return `
  <svg viewBox="0 0 240 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.label}">
    <ellipse cx="120" cy="382" rx="56" ry="10" fill="#000" opacity="0.18"/>

    <!-- legs -->
    <rect x="86" y="${legsTopY}" width="26" height="90" rx="12" fill="${p.skin}"/>
    <rect x="128" y="${legsTopY}" width="26" height="90" rx="12" fill="${p.skin}"/>
    <!-- socks -->
    <rect x="84" y="330" width="30" height="26" rx="8" fill="#f5f7ff"/>
    <rect x="126" y="330" width="30" height="26" rx="8" fill="#f5f7ff"/>
    <!-- shoes -->
    <rect x="80" y="350" width="38" height="20" rx="9" fill="#1b1b1f"/>
    <rect x="122" y="350" width="38" height="20" rx="9" fill="#1b1b1f"/>
    <rect x="80" y="362" width="38" height="6" rx="3" fill="#f5f7ff"/>
    <rect x="122" y="362" width="38" height="6" rx="3" fill="#f5f7ff"/>

    <!-- back arm sliver (ball rests near here) -->
    <ellipse cx="70" cy="196" rx="14" ry="20" fill="${p.skin}"/>

    <!-- torso / jersey -->
    <path d="M60,110 Q60,88 86,88 L154,88 Q180,88 180,110 L172,196 Q170,206 160,206 L80,206 Q70,206 68,196 Z" fill="${p.jersey}"/>
    <path d="M120,92 L134,110 L120,200 L106,110 Z" fill="${p.jerseyTrim}" opacity="0.35"/>
    <text x="120" y="165" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="42" fill="${p.jerseyTrim}">${p.number}</text>

    <!-- arms -->
    <ellipse cx="56" cy="130" rx="17" ry="40" fill="${p.jersey}"/>
    <ellipse cx="184" cy="130" rx="17" ry="40" fill="${p.jersey}"/>
    <ellipse cx="52" cy="172" rx="14" ry="22" fill="${p.skin}"/>
    <ellipse cx="188" cy="168" rx="14" ry="22" fill="${p.skin}"/>

    ${bottom}

    <!-- head + hair -->
    <circle cx="120" cy="55" r="36" fill="${p.skin}"/>
    ${hair}
  </svg>`;
}

function characterLabel(characterId) {
  return (AVATAR_PRESETS[characterId] || AVATAR_PRESETS.boy_dark).label;
}
