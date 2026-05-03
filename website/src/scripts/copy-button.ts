export function setupCopyButtons(root: ParentNode = document): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>('[data-copy]');
  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const text = button.getAttribute('data-copy') ?? '';
      const labelDefault = button.dataset.labelDefault ?? button.textContent ?? '';
      const labelCopied = button.dataset.labelCopied ?? 'Copied';
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = labelCopied;
        button.classList.add('is-copied');
        window.setTimeout(() => {
          button.textContent = labelDefault;
          button.classList.remove('is-copied');
        }, 1600);
      } catch {
        button.textContent = 'Copy failed';
        window.setTimeout(() => {
          button.textContent = labelDefault;
        }, 1600);
      }
    });
  }
}
