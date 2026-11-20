// Shared fixtures for the brand screenshots. Everything here is public and
// deterministic: covers come from the capture harness itself, so no request
// leaves the machine.

export const directories = [
  'Entertainment',
  'Entertainment/Anime & Series',
  'Learning',
  'Self-Hosting',
];

const subjects = [
  {
    dir: 'Self-Hosting',
    filename: 'Vaultwarden.md',
    title: 'Vaultwarden',
    url: 'https://github.com/dani-garcia/vaultwarden',
    created: '2026-11-12',
    description: 'Lightweight, self-hosted Bitwarden-compatible password manager server written in Rust.',
    favicon: '',
    tags: ['bookmarks', 'self-hosting', 'security'],
  },
  {
    dir: 'Learning',
    filename: 'Obsidian Dataview.md',
    title: 'Obsidian Dataview',
    url: 'https://blacksmithgu.github.io/obsidian-dataview/',
    created: '2026-11-09',
    description: 'Query language and index over your notes. This is the plugin that renders the Vaultmarks viewer.',
    favicon: '',
    tags: ['bookmarks', 'obsidian', 'dataview'],
  },
  {
    dir: 'Learning',
    filename: 'Learn Vim.md',
    title: 'Learn Vim',
    url: 'https://vimhelp.org/',
    created: '2026-11-06',
    description: 'The official Vim help pages, searchable and linked: motions, registers, macros and the rest.',
    favicon: '',
    tags: ['bookmarks', 'vim', 'reference'],
  },
  {
    dir: 'Learning',
    filename: 'ArcoLinux.md',
    title: 'ArcoLinux',
    url: 'https://arcolinux.com/',
    created: '2026-11-02',
    description: 'Arch-based distribution with a long, practical catalogue of Linux tutorials.',
    favicon: '',
    tags: ['bookmarks', 'linux', 'arch'],
  },
  {
    dir: 'Entertainment/Anime & Series',
    filename: 'AniList.md',
    title: 'AniList',
    url: 'https://anilist.co/',
    created: '2026-10-28',
    description: 'Track anime and manga, browse seasonal charts, and keep a watch history in one place.',
    favicon: '',
    tags: ['bookmarks', 'anime'],
  },
  {
    dir: 'Entertainment',
    filename: 'CodePen.md',
    title: 'CodePen',
    url: 'https://codepen.io/',
    created: '2026-10-24',
    description: 'A front-end playground for HTML, CSS and JavaScript demos you can share with a link.',
    favicon: '',
    tags: ['bookmarks', 'frontend', 'demos'],
  },
];

const gradients = [
  ['#1b1730', '#5a3fd1', '#a78bfa'],
  ['#14101f', '#3b2a6e', '#8b6ef5'],
  ['#0c0a14', '#241d3d', '#c4b5fd'],
  ['#1b1730', '#0f766e', '#8b6ef5'],
  ['#14101f', '#4c1d95', '#a78bfa'],
  ['#0c0a14', '#2d2550', '#c4b5fd'],
];

export function coverSvg(index) {
  const [ink, mid, violet] = gradients[index % gradients.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ink}"/>
      <stop offset="0.55" stop-color="${mid}"/>
      <stop offset="1" stop-color="${violet}"/>
    </linearGradient>
    <radialGradient id="h" cx="0.78" cy="0.2" r="0.7">
      <stop offset="0" stop-color="#f5f2ff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#f5f2ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <rect width="640" height="360" fill="url(#h)"/>
  <g fill="none" stroke="#f5f2ff" stroke-opacity="0.22" stroke-width="2" stroke-linejoin="round">
    <polygon points="70,60 220,60 170,150 70,120"/>
    <polygon points="220,60 220,210 170,150"/>
    <polygon points="170,150 220,210 150,280 70,230"/>
    <polygon points="470,250 590,250 540,330 470,300"/>
  </g>
</svg>`;
}

export const notes = subjects.map((subject, index) => ({
  key: `${subject.dir}/${subject.filename}`,
  dir: subject.dir,
  filename: subject.filename,
  title: subject.title,
  url: subject.url,
  created: subject.created,
  description: subject.description,
  image: `/__brand/cover-${index}.svg`,
  favicon: subject.favicon,
  tags: subject.tags,
  cover: `/__brand/cover-${index}.svg`,
  body: subject.description,
  raw: '',
  lastModified: Date.parse(`${subject.created}T12:00:00Z`),
  size: subject.description.length,
}));

export const viewerPages = notes.map((note) => ({
  title: note.title,
  url: note.url,
  description: note.description,
  image: note.image,
  favicon: note.favicon,
  tags: note.tags,
  file: {
    name: note.filename.replace(/\.md$/, ''),
    folder: `Bookmarks/${note.dir}`,
    path: `Bookmarks/${note.key}`,
  },
}));
