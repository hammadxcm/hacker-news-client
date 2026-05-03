interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  opacity: number;
}

const CONNECT_DIST = 140;
const MOUSE_RADIUS = 160;
const PARTICLE_DENSITY = 12000;

function getBrandRgb(): [number, number, number] {
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
  const hex = brand.replace('#', '');
  if (hex.length === 6) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return [255, 102, 0];
}

export function setupHeroCanvas(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0;
  let h = 0;
  let particles: Particle[] = [];
  const mouse: { x: number | null; y: number | null } = { x: null, y: null };
  let running = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spawn();
  }

  function spawn(): void {
    const count = Math.max(36, Math.min(140, Math.floor((w * h) / PARTICLE_DENSITY)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 0.7 + Math.random() * 1.4,
      opacity: 0.25 + Math.random() * 0.45,
    }));
  }

  function step(): void {
    if (!ctx || !running) return;
    ctx.clearRect(0, 0, w, h);
    const [r, g, b] = getBrandRgb();

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      if (mouse.x !== null && mouse.y !== null) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          p.x += (dx / dist) * force * 1.4;
          p.y += (dy / dist) * force * 1.4;
        }
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity})`;
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      if (!a) continue;
      for (let j = i + 1; j < particles.length; j++) {
        const c = particles[j];
        if (!c) continue;
        const dx = a.x - c.x;
        const dy = a.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < CONNECT_DIST) {
          const opacity = (1 - dist / CONNECT_DIST) * 0.22;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    if (running) {
      requestAnimationFrame(step);
    }
  }

  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseLeave(): void {
    mouse.x = null;
    mouse.y = null;
  }

  function onVisibility(): void {
    running = !document.hidden;
    if (running) requestAnimationFrame(step);
  }

  resize();
  if (!reduceMotion) {
    requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('visibilitychange', onVisibility);
  } else {
    ctx.fillStyle = 'transparent';
  }

  return () => {
    running = false;
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mouseleave', onMouseLeave);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
