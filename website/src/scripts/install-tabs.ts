export function setupInstallTabs(root: ParentNode = document): void {
  const groups = root.querySelectorAll<HTMLElement>('[data-tabs]');

  for (const group of groups) {
    const tablist = group.querySelector<HTMLElement>('[role="tablist"]');
    const tabs = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const panels = Array.from(group.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const indicator = group.querySelector<HTMLElement>('[data-tab-indicator]');
    if (!tabs.length) continue;

    function moveIndicator(target: HTMLButtonElement): void {
      if (!indicator || !tablist) return;
      const trackRect = tablist.getBoundingClientRect();
      const tabRect = target.getBoundingClientRect();
      const left = tabRect.left - trackRect.left;
      const width = tabRect.width;
      indicator.style.transform = `translateX(${left}px)`;
      indicator.style.width = `${width}px`;
    }

    function select(id: string, focus = false): void {
      let target: HTMLButtonElement | null = null;
      for (const tab of tabs) {
        const active = tab.dataset.tab === id;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        if (active) target = tab;
      }

      for (const panel of panels) {
        const matches = panel.dataset.tabPanel === id;
        if (matches) {
          panel.hidden = false;
          panel.classList.add('is-active');
        } else {
          panel.classList.remove('is-active');
          panel.hidden = true;
        }
      }

      if (target) {
        moveIndicator(target);
        if (focus) target.focus();
      }
    }

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const id = tab.dataset.tab;
        if (id) select(id);
      });
    }

    tablist?.addEventListener('keydown', (event) => {
      const ev = event as KeyboardEvent;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
      ev.preventDefault();
      const currentIdx = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      let nextIdx = currentIdx;
      if (ev.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabs.length;
      if (ev.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
      if (ev.key === 'Home') nextIdx = 0;
      if (ev.key === 'End') nextIdx = tabs.length - 1;
      const id = tabs[nextIdx]?.dataset.tab;
      if (id) select(id, true);
    });

    const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
    if (initial?.dataset.tab) {
      const observer = new ResizeObserver(() => moveIndicator(initial));
      observer.observe(group);
      requestAnimationFrame(() => moveIndicator(initial));
    }
  }
}
