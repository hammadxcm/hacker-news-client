export type ThemeId =
  | 'dark'
  | 'light'
  | 'dracula'
  | 'nord'
  | 'catppuccin'
  | 'synthwave'
  | 'matrix'
  | 'bloodmoon'
  | 'midnight'
  | 'gruvbox'
  | 'cyberpunk'
  | 'nebula'
  | 'solarized'
  | 'rosepine'
  | 'monokai';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  swatch: string;
}

export const themes: ThemeInfo[] = [
  { id: 'dark', label: 'HN Dark', swatch: '#ff6600' },
  { id: 'light', label: 'Light', swatch: '#d4004a' },
  { id: 'dracula', label: 'Dracula', swatch: '#ff79c6' },
  { id: 'nord', label: 'Nord', swatch: '#bf616a' },
  { id: 'catppuccin', label: 'Catppuccin', swatch: '#f38ba8' },
  { id: 'synthwave', label: 'Synthwave', swatch: '#ff2e97' },
  { id: 'matrix', label: 'Matrix', swatch: '#00ff41' },
  { id: 'bloodmoon', label: 'Blood Moon', swatch: '#ff0040' },
  { id: 'midnight', label: 'Midnight', swatch: '#e8457c' },
  { id: 'gruvbox', label: 'Gruvbox', swatch: '#fabd2f' },
  { id: 'cyberpunk', label: 'Cyberpunk', swatch: '#ff2e97' },
  { id: 'nebula', label: 'Nebula', swatch: '#e040fb' },
  { id: 'solarized', label: 'Solarized', swatch: '#dc322f' },
  { id: 'rosepine', label: 'Rose Pine', swatch: '#ea9a97' },
  { id: 'monokai', label: 'Monokai', swatch: '#a6e22e' },
];

export const defaultTheme: ThemeId = 'dark';
export const themeIds = themes.map((t) => t.id);
