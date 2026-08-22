import { closeMinigame } from "./wire.js";

const TOTAL_ASTEROIDS = 20;
const CANVAS_W = 320;
const CANVAS_H = 220;

interface Asteroid {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

export function openAsteroidsMinigame(taskId: string, onComplete: (taskId: string) => void): void {
  const overlay = document.getElementById("minigame-overlay")!;
  const title = document.getElementById("minigame-title")!;
  const content = document.getElementById("minigame-content")!;

  title.textContent = "ASTEROİDLERİ YOK ET";
  content.innerHTML = "";

  const counter = document.createElement("div");
  counter.className = "asteroid-counter";
  counter.textContent = `0 / ${TOTAL_ASTEROIDS}`;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.className = "asteroid-canvas";
  const ctx = canvas.getContext("2d")!;

  const asteroids: Asteroid[] = [];
  let destroyed = 0;
  let finished = false;
  let spawnTimer = 0;
  let lastTime = performance.now();
  let rafId = 0;

  function spawn(): void {
    asteroids.push({
      x: Math.random() * (CANVAS_W - 40) + 20,
      y: Math.random() * (CANVAS_H - 80) + 30,
      r: 14 + Math.random() * 8,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
    });
  }

  function draw(): void {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // starfield backdrop
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 30; i++) {
      const sx = (i * 97) % CANVAS_W;
      const sy = (i * 53) % CANVAS_H;
      ctx.fillRect(sx, sy, 1, 1);
    }
    for (const a of asteroids) {
      ctx.beginPath();
      ctx.fillStyle = "#9c8468";
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6b5a45";
      ctx.stroke();
    }
  }

  function loop(now: number): void {
    if (finished) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    spawnTimer -= dt;
    if (spawnTimer <= 0 && asteroids.length < 5 && destroyed + asteroids.length < TOTAL_ASTEROIDS) {
      spawn();
      spawnTimer = 0.5;
    }

    for (const a of asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < a.r || a.x > CANVAS_W - a.r) a.vx *= -1;
      if (a.y < a.r || a.y > CANVAS_H - a.r) a.vy *= -1;
    }

    draw();
    rafId = requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      if ((px - a.x) ** 2 + (py - a.y) ** 2 <= (a.r + 6) ** 2) {
        asteroids.splice(i, 1);
        destroyed++;
        counter.textContent = `${destroyed} / ${TOTAL_ASTEROIDS}`;
        if (destroyed >= TOTAL_ASTEROIDS) {
          finished = true;
          cancelAnimationFrame(rafId);
          setTimeout(() => {
            closeMinigame();
            onComplete(taskId);
          }, 300);
        }
        break;
      }
    }
  });

  content.appendChild(counter);
  content.appendChild(canvas);
  overlay.hidden = false;

  spawn();
  spawn();
  rafId = requestAnimationFrame(loop);
}
