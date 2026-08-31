// Shared pseudo-3D rendering helpers, available globally to every level
// (loaded before the level scripts). Pure canvas 2D — gradients, bevels
// and soft shadows standing in for real depth.
const FX = (() => {
  function shade(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
    let b = (num & 0xff) + Math.round(2.55 * percent);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  // Soft dropped shadow ellipse, e.g. beneath a sprite standing on a floor.
  function shadow(ctx, cx, cy, rx, ry, alpha = 0.35) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A rect with a lit top/left edge and a shaded bottom/right edge —
  // classic raised-button/brick bevel.
  function bevelRect(ctx, x, y, w, h, color, bevel = 3) {
    const light = shade(color, 28);
    const dark = shade(color, -32);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, bevel);
    ctx.fillRect(x, y, bevel, h);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - bevel, w, bevel);
    ctx.fillRect(x + w - bevel, y, bevel, h);
  }

  // Inset (pressed-in) variant — dark top/left, light bottom/right.
  function insetRect(ctx, x, y, w, h, color, bevel = 3) {
    const light = shade(color, 28);
    const dark = shade(color, -32);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y, w, bevel);
    ctx.fillRect(x, y, bevel, h);
    ctx.fillStyle = light;
    ctx.fillRect(x, y + h - bevel, w, bevel);
    ctx.fillRect(x + w - bevel, y, bevel, h);
  }

  // A filled circle shaded like a lit sphere (radial gradient + rim darkening).
  function sphere(ctx, cx, cy, r, color) {
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r * 1.05);
    grad.addColorStop(0, shade(color, 55));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, -35));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A rounded-rect panel with a top-to-bottom gradient, for surfaces like
  // paddles, roads, or floor strips.
  function gradientRect(ctx, x, y, w, h, colorTop, colorBottom) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(1, colorBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // A beveled rounded block (used for tetromino-style / brick-style cells).
  function bevelBlock(ctx, x, y, w, h, color, radius = 3) {
    const light = shade(color, 35);
    const dark = shade(color, -35);
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, Math.max(2, h * 0.28));
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - Math.max(2, h * 0.22), w, Math.max(2, h * 0.22));
    ctx.restore();
  }

  // Faint horizontal scan lines, like a CRT arcade monitor.
  function scanlines(ctx, w, h, alpha = 0.05) {
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  }

  // Radial darkening toward the screen edges, like a curved CRT tube.
  function vignette(ctx, w, h, strength = 0.35) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Brushed-metal gradient for chrome/steel surfaces (HUD panels, vehicle trim).
  function chrome(ctx, x, y, w, h) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#e8ecf4');
    grad.addColorStop(0.28, '#aab2c4');
    grad.addColorStop(0.5, '#6a7284');
    grad.addColorStop(0.72, '#aab2c4');
    grad.addColorStop(1, '#3a4054');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }

  return { shade, shadow, bevelRect, insetRect, sphere, gradientRect, roundRectPath, bevelBlock, scanlines, vignette, chrome };
})();
