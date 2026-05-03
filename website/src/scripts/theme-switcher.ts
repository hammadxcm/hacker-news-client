type ThemeId = string;
const STORAGE_KEY = 'hn-client-theme';

const VALID_THEMES = [
  'dark',
  'light',
  'dracula',
  'nord',
  'catppuccin',
  'synthwave',
  'matrix',
  'bloodmoon',
  'midnight',
  'gruvbox',
  'cyberpunk',
  'nebula',
  'solarized',
  'rosepine',
  'monokai',
];

function isValidTheme(value: string | null | undefined): value is ThemeId {
  return value != null && VALID_THEMES.includes(value);
}

function getStoredTheme(): ThemeId | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isValidTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function persistTheme(theme: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage unavailable */
  }
}

function getCurrentTheme(): ThemeId {
  const attr = document.documentElement.getAttribute('data-theme');
  return isValidTheme(attr) ? attr : 'dark';
}

function syncSelectedClass(panel: HTMLElement, theme: ThemeId): void {
  const options = panel.querySelectorAll<HTMLButtonElement>('[data-theme-option]');
  for (const opt of options) {
    const active = opt.dataset.themeOption === theme;
    opt.setAttribute('aria-selected', active ? 'true' : 'false');
    opt.classList.toggle('is-active', active);
  }
}

function syncTriggerColor(trigger: HTMLElement, theme: ThemeId): void {
  trigger.dataset.activeTheme = theme;
}

export function setupThemeSwitcher(root: HTMLElement): void {
  const trigger = root.querySelector<HTMLButtonElement>('[data-theme-trigger]');
  const panel = root.querySelector<HTMLElement>('[data-theme-panel]');
  const random = root.querySelector<HTMLButtonElement>('[data-theme-random]');
  if (!trigger || !panel) return;

  const stored = getStoredTheme();
  if (stored) {
    applyTheme(stored);
  }
  syncSelectedClass(panel, getCurrentTheme());
  syncTriggerColor(trigger, getCurrentTheme());

  function open(): void {
    if (!panel || !trigger) return;
    panel.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    panel.removeAttribute('hidden');
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onEscape);
  }

  function close(): void {
    if (!panel || !trigger) return;
    panel.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.setAttribute('hidden', '');
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onEscape);
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!root.contains(event.target as Node)) close();
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      close();
      trigger?.focus();
    }
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (panel.classList.contains('is-open')) {
      close();
    } else {
      open();
    }
  });

  panel.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-option]');
    if (!target) return;
    const theme = target.dataset.themeOption;
    if (!isValidTheme(theme)) return;
    applyTheme(theme);
    persistTheme(theme);
    syncSelectedClass(panel, theme);
    syncTriggerColor(trigger, theme);
    close();
  });

  random?.addEventListener('click', () => {
    const current = getCurrentTheme();
    const others = VALID_THEMES.filter((t) => t !== current);
    const next = others[Math.floor(Math.random() * others.length)] ?? 'dark';
    applyTheme(next);
    persistTheme(next);
    syncSelectedClass(panel, next);
    syncTriggerColor(trigger, next);
  });
}
