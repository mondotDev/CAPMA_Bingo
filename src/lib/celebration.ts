import confetti from "canvas-confetti";

function readThemeColor(variableName: string, fallback: string) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  return value || fallback;
}

export function launchSquarePoof(originX: number, originY: number) {
  confetti({
    angle: 90,
    spread: 52,
    startVelocity: 24,
    particleCount: 16,
    ticks: 75,
    gravity: 1.1,
    scalar: 0.72,
    origin: { x: originX, y: originY },
    colors: [
      readThemeColor("--color-primary", "#123f68"),
      readThemeColor("--color-secondary", "#2c7a4a"),
    ],
    zIndex: 1200,
    disableForReducedMotion: true,
  });
}

export function launchCompletionConfetti() {
  const defaults = {
    spread: 70,
    startVelocity: 32,
    ticks: 220,
    scalar: 1,
    zIndex: 1200,
    disableForReducedMotion: true,
  };

  confetti({
    ...defaults,
    particleCount: 110,
    origin: { x: 0.5, y: 0.58 },
  });

  window.setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 70,
      angle: 60,
      origin: { x: 0.12, y: 0.62 },
    });
  }, 120);

  window.setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 70,
      angle: 120,
      origin: { x: 0.88, y: 0.62 },
    });
  }, 220);
}
