export function setupTypingTerminal(el: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.querySelectorAll<HTMLElement>('[data-typed]').forEach((line) => {
      line.classList.add('is-done');
    });
    return;
  }

  const lines = Array.from(el.querySelectorAll<HTMLElement>('[data-typed]'));
  if (!lines.length) return;

  const cps = 28;
  const cancelled = false;

  function typeOne(line: HTMLElement, text: string, onDone: () => void): void {
    line.textContent = '';
    line.classList.add('is-typing');
    let i = 0;
    function tick(): void {
      if (cancelled) return;
      if (i < text.length) {
        line.textContent = text.slice(0, i + 1);
        i += 1;
        window.setTimeout(tick, 1000 / cps + (Math.random() * 30 - 15));
      } else {
        line.classList.remove('is-typing');
        line.classList.add('is-done');
        onDone();
      }
    }
    tick();
  }

  function runSequence(idx: number): void {
    if (cancelled || idx >= lines.length) return;
    const line = lines[idx];
    if (!line) return;
    const text = line.dataset.text ?? line.textContent ?? '';
    const delay = Number.parseInt(line.dataset.delay ?? '0', 10);
    window.setTimeout(() => typeOne(line, text, () => runSequence(idx + 1)), delay);
  }

  for (const line of lines) {
    if (!line.dataset.text) {
      line.dataset.text = line.textContent ?? '';
    }
    line.textContent = '';
  }

  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          runSequence(0);
          obs.disconnect();
        }
      }
    },
    { threshold: 0.4 },
  );
  obs.observe(el);

  return;
}
