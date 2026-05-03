type Theme = 'light' | 'dark';
const STORAGE_KEY = 'hn-client-theme';

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

function getStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function initTheme(): void {
  const initial = getStoredTheme() ?? getSystemTheme();
  applyTheme(initial);
}

export function setupThemeToggle(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme | null) ?? 'dark';
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — silently skip persistence
    }
  });
}
