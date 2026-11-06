"use client";

import { useEffect, useRef } from "react";

/* ───────────────────────────────────────────────────────────
   The Polarsight mark rendered as a 3D point cloud.

   The three artwork layers are sampled into dots at runtime, so
   there is no data file to ship. Each layer sits at its own
   depth, the cloud is rotated and projected by hand every frame,
   and dots are shaded and scaled by distance, which is what
   reads as volume rather than a flat pattern.
   ─────────────────────────────────────────────────────────── */

const LAYERS = [
  { src: "/mark-arc.png", z: -55, step: 7 },
  { src: "/mark-bear.png", z: 0, step: 7 },
  { src: "/mark-star.png", z: 70, step: 7 },
];

/* Sampling grid in source pixels. This has to stay wider than a dot
   (2 x DOT = 5.8), otherwise neighbouring dots overlap and the mark
   reads as a smear instead of distinct pixels. At 7 there is a 1.2
   gap, which is what gives it the pixelated look. */
const STEP = 7;
const ALPHA_MIN = 60; // ignore near-transparent pixels
const DOT = 2.9; // base dot radius
const FOCAL = 900;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* Walk one layer on a grid and collect a dot per opaque sample.

   Samples with no neighbour on the grid are dropped. Those come from
   the tapering tip of the arc and the antialiased edge of the bear,
   and render as detached specks floating beside the artwork. */
function sampleLayer(img, z, out, step = STEP) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);

  const found = new Map();
  const key = (x, y) => `${x},${y}`;

  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      const i = (y * c.width + x) * 4;
      if (data[i + 3] < ALPHA_MIN) continue;
      found.set(key(x, y), { x, y, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  const NEIGHBOURS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [1, -1], [-1, 1],
  ];

  for (const d of found.values()) {
    const hasNeighbour = NEIGHBOURS.some(([dx, dy]) =>
      found.has(key(d.x + dx * step, d.y + dy * step))
    );
    if (!hasNeighbour) continue;

    out.push({
      x: d.x - c.width / 2,
      y: d.y - c.height / 2,
      z,
      r: d.r,
      g: d.g,
      b: d.b,
    });
  }

  return { w: c.width, h: c.height };
}

export function HeroMark({ className = "" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dots = [];
    let source = { w: 621, h: 528 };
    let raf = 0;
    let alive = true;
    let t = 0;

    // Current and target rotation, in radians
    let rx = 0, ry = 0, tx = 0, ty = 0;
    let pointerInside = false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!dots.length) return;

      // Fit the artwork into the canvas with a little breathing room
      const fit = Math.min(w / source.w, h / source.h) * 0.92;
      const cx = w / 2;
      const cy = h / 2;

      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosX = Math.cos(rx), sinX = Math.sin(rx);

      // Project every dot, then paint far to near
      const proj = new Array(dots.length);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const x1 = d.x * cosY + d.z * sinY;
        const z1 = -d.x * sinY + d.z * cosY;
        const y1 = d.y * cosX - z1 * sinX;
        const z2 = d.y * sinX + z1 * cosX;

        const scale = FOCAL / (FOCAL + z2);
        proj[i] = {
          sx: cx + x1 * fit * scale,
          sy: cy + y1 * fit * scale,
          r: DOT * dpr * fit * scale,
          // Nearer dots read brighter, which is what gives the cloud depth
          shade: Math.max(0.45, Math.min(1.25, scale * 1.05)),
          z: z2,
          c: d,
        };
      }
      proj.sort((a, b) => b.z - a.z);

      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        if (p.r <= 0.1) continue;
        const c = p.c;
        const r = Math.min(255, c.r * p.shade) | 0;
        const g = Math.min(255, c.g * p.shade) | 0;
        const b = Math.min(255, c.b * p.shade) | 0;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, p.r, 0, 6.283185307179586);
        ctx.fill();
      }
    }

    function frame() {
      if (!alive) return;
      t += 0.0055;

      if (!pointerInside) {
        // Idle drift when nothing is pointing at it
        tx = Math.sin(t * 0.9) * 0.1;
        ty = Math.sin(t * 1.3) * 0.16;
      }

      // Ease toward the target; this is what makes it feel fluid
      rx += (tx - rx) * 0.07;
      ry += (ty - ry) * 0.07;

      draw();
      raf = requestAnimationFrame(frame);
    }

    function onMove(e) {
      if (reduce) return;
      const rect = wrap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      pointerInside = true;
      ty = nx * 0.85;
      tx = -ny * 0.6;
    }

    function onLeave() {
      pointerInside = false;
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw();
    });

    (async () => {
      try {
        const imgs = await Promise.all(LAYERS.map((l) => loadImage(l.src)));
        if (!alive) return;
        const collected = [];
        imgs.forEach((img, i) => {
          source = sampleLayer(img, LAYERS[i].z, collected, LAYERS[i].step);
        });
        dots = collected;

        resize();
        ro.observe(wrap);
        wrap.addEventListener("pointermove", onMove);
        wrap.addEventListener("pointerleave", onLeave);

        if (reduce) {
          rx = -0.1;
          ry = 0.18;
          draw();
        } else {
          frame();
        }
      } catch {
        /* If the layers cannot be read, the canvas simply stays empty */
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Halo behind the cloud */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[12%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(22,119,232,0.20), rgba(140,207,255,0.06) 48%, transparent 70%)",
        }}
      />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="The Polarsight mark, a polar bear with a crescent and star, drawn as a rotating cloud of dots"
        className="relative h-full w-full"
      />
    </div>
  );
}
