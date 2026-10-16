export const PALETTES = {
    bear: [
        { base: '#92510f', headLight: '#ca8a04', bodyTop: '#a16207', bodyBottom: '#713f12', snout: '#fef08a', extra: '#fbcfe8' },
        { base: '#e2e8f0', headLight: '#f8fafc', bodyTop: '#cbd5e1', bodyBottom: '#94a3b8', snout: '#f1f5f9', extra: '#bae6fd' },
        { base: '#f472b6', headLight: '#fbcfe8', bodyTop: '#ec4899', bodyBottom: '#be185d', snout: '#fdf2f8', extra: '#fce7f3' },
        { base: '#10b981', headLight: '#6ee7b7', bodyTop: '#059669', bodyBottom: '#065f46', snout: '#d1fae5', extra: '#a7f3d0' }
    ],
    cat: [
        { base: '#9ca3af', headLight: '#f1f5f9', bodyTop: '#cbd5e1', bodyBottom: '#64748b', snout: '#8B96A6', extra: '#f1f5f9' },
        { base: '#f59e0b', headLight: '#fde68a', bodyTop: '#d97706', bodyBottom: '#b45309', snout: '#fef3c7', extra: '#fde68a' },
        { base: '#334155', headLight: '#475569', bodyTop: '#1e293b', bodyBottom: '#0f172a', snout: '#64748b', extra: '#475569' },
        { base: '#f8fafc', headLight: '#ffffff', bodyTop: '#e2e8f0', bodyBottom: '#cbd5e1', snout: '#f1f5f9', extra: '#f87171' }
    ],
    moose: [
        { base: '#78350f', headLight: '#b45309', bodyTop: '#78350f', bodyBottom: '#451a03', snout: '#8B96A6', extra: '#b45309' },
        { base: '#eab308', headLight: '#fef08a', bodyTop: '#ca8a04', bodyBottom: '#a16207', snout: '#fef9c3', extra: '#854d0e' },
        { base: '#3b82f6', headLight: '#93c5fd', bodyTop: '#2563eb', bodyBottom: '#1d4ed8', snout: '#dbeafe', extra: '#1e3a8a' },
        { base: '#a855f7', headLight: '#d8b4fe', bodyTop: '#9333ea', bodyBottom: '#7e22ce', snout: '#f3e8ff', extra: '#581c87' }
    ],
    dog: [
        { base: '#b45309', headLight: '#fbbf24', bodyTop: '#d97706', bodyBottom: '#92400e', snout: '#fef08a', extra: '#92400e' },
        { base: '#94a3b8', headLight: '#e2e8f0', bodyTop: '#64748b', bodyBottom: '#475569', snout: '#f8fafc', extra: '#334155' },
        { base: '#fbbf24', headLight: '#fde68a', bodyTop: '#f59e0b', bodyBottom: '#d97706', snout: '#fffbeb', extra: '#b45309' },
        { base: '#ef4444', headLight: '#fca5a5', bodyTop: '#dc2626', bodyBottom: '#991b1b', snout: '#fee2e2', extra: '#7f1d1d' }
    ],
    bird: [
        { base: '#3b82f6', headLight: '#93c5fd', bodyTop: '#2563eb', bodyBottom: '#1d4ed8', snout: '#f59e0b', extra: '#60a5fa' },
        { base: '#ef4444', headLight: '#fca5a5', bodyTop: '#dc2626', bodyBottom: '#991b1b', snout: '#f59e0b', extra: '#f87171' },
        { base: '#eab308', headLight: '#fef08a', bodyTop: '#ca8a04', bodyBottom: '#a16207', snout: '#f97316', extra: '#fde047' },
        { base: '#334155', headLight: '#475569', bodyTop: '#1e293b', bodyBottom: '#0f172a', snout: '#475569', extra: '#64748b' }
    ],
    penguin: [
        { base: '#0f172a', headLight: '#1e293b', bodyTop: '#0f172a', bodyBottom: '#020617', snout: '#f59e0b', extra: '#f8fafc' },
        { base: '#334155', headLight: '#475569', bodyTop: '#334155', bodyBottom: '#1e293b', snout: '#f97316', extra: '#fef08a' },
        { base: '#1e3a8a', headLight: '#1d4ed8', bodyTop: '#1e3a8a', bodyBottom: '#172554', snout: '#64748b', extra: '#e2e8f0' },
        { base: '#78350f', headLight: '#92400e', bodyTop: '#78350f', bodyBottom: '#451a03', snout: '#1c1917', extra: '#d6d3d1' }
    ],
    custom: [ { base: '#ffffff', snout: '#ffffff', extra: '#ffffff' } ]
};

function drawBearBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.bear[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const ex = cx - yaw * 0.3; const ey = cy - pitch * 0.3;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    const gradT = ctx.createRadialGradient(hx, hy+r*1.5, 0, hx, hy+r*1.5, r);
    gradT.addColorStop(0, colors.bodyTop); gradT.addColorStop(1, colors.bodyBottom);
    ctx.fillStyle = gradT; ctx.beginPath(); ctx.roundRect(hx - r*0.8, hy + r*0.5, r*1.6, r, r*0.5); ctx.fill();
    ctx.fillStyle = colors.base;
    ctx.beginPath(); ctx.arc(ex - r*0.7, ey - r*0.7, r*0.3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ex + r*0.7, ey - r*0.7, r*0.3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.extra;
    ctx.beginPath(); ctx.arc(ex - r*0.7, ey - r*0.7, r*0.15, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ex + r*0.7, ey - r*0.7, r*0.15, 0, Math.PI*2); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy-r*0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.bodyBottom;
    ctx.beginPath(); ctx.arc(px - r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(px + r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill();
}

function drawCatBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.cat[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const ex = cx - yaw * 0.3; const ey = cy - pitch * 0.3;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    const gradT = ctx.createRadialGradient(hx, hy+r*1.5, 0, hx, hy+r*1.5, r);
    gradT.addColorStop(0, colors.bodyTop); gradT.addColorStop(1, colors.bodyBottom);
    ctx.fillStyle = gradT; ctx.beginPath(); ctx.roundRect(hx - r*0.7, hy + r*0.5, r*1.4, r, r*0.5); ctx.fill();
    ctx.fillStyle = colors.base;
    ctx.beginPath(); ctx.moveTo(ex - r*0.8, ey - r); ctx.lineTo(ex - r*0.3, ey - r*0.6); ctx.lineTo(ex - r*0.9, ey - r*0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ex + r*0.8, ey - r); ctx.lineTo(ex + r*0.3, ey - r*0.6); ctx.lineTo(ex + r*0.9, ey - r*0.2); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy-r*0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(hx, hy, r*1.1, r*0.9, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.extra;
    ctx.beginPath(); ctx.arc(px - r*0.5, py + r*1.2, r*0.2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(px + r*0.5, py + r*1.2, r*0.2, 0, Math.PI*2); ctx.fill();
}

function drawMooseBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.moose[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const ex = cx - yaw * 0.3; const ey = cy - pitch * 0.3;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    const gradT = ctx.createRadialGradient(hx, hy+r*1.5, 0, hx, hy+r*1.5, r);
    gradT.addColorStop(0, colors.bodyTop); gradT.addColorStop(1, colors.bodyBottom);
    ctx.fillStyle = gradT; ctx.beginPath(); ctx.roundRect(hx - r*0.8, hy + r*0.5, r*1.6, r, r*0.5); ctx.fill();
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = colors.extra;
    ctx.beginPath(); ctx.moveTo(hx - r * 0.5, hy - r * 0.7); ctx.quadraticCurveTo(hx - r * 1.1, hy - r * 1.2, hx - r * 1.5, hy - r * 1.6); ctx.moveTo(hx - r * 0.8, hy - r * 0.9); ctx.lineTo(hx - r * 1.1, hy - r * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + r * 0.5, hy - r * 0.7); ctx.quadraticCurveTo(hx + r * 1.1, hy - r * 1.2, hx + r * 1.5, hy - r * 1.6); ctx.moveTo(hx + r * 0.8, hy - r * 0.9); ctx.lineTo(hx + r * 1.1, hy - r * 1.3); ctx.stroke();
    ctx.fillStyle = colors.base;
    ctx.beginPath(); ctx.ellipse(ex - r * 0.8, ey - r * 0.2, r * 0.35, r * 0.2, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + r * 0.8, ey - r * 0.2, r * 0.35, r * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy - r * 0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.bodyBottom;
    ctx.beginPath(); ctx.arc(px - r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(px + r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill();
}

function drawDogBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.dog[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const ex = cx - yaw * 0.3; const ey = cy - pitch * 0.3;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    const gradT = ctx.createRadialGradient(hx, hy+r*1.5, 0, hx, hy+r*1.5, r);
    gradT.addColorStop(0, colors.bodyTop); gradT.addColorStop(1, colors.bodyBottom);
    ctx.fillStyle = gradT; ctx.beginPath(); ctx.roundRect(hx - r*0.8, hy + r*0.5, r*1.6, r, r*0.5); ctx.fill();
    ctx.fillStyle = colors.extra;
    ctx.beginPath(); ctx.ellipse(ex - r * 0.8, ey, r * 0.3, r * 0.6, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + r * 0.8, ey, r * 0.3, r * 0.6, -0.3, 0, Math.PI * 2); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy-r*0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.bodyBottom;
    ctx.beginPath(); ctx.arc(px - r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(px + r*0.6, py + r*1.2, r*0.25, 0, Math.PI*2); ctx.fill();
}

function drawBirdBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.bird[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    ctx.fillStyle = colors.bodyTop;
    ctx.beginPath(); ctx.ellipse(hx - r*0.7, hy + r*0.8, r*0.3, r*0.7, -0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + r*0.7, hy + r*0.8, r*0.3, r*0.7, 0.5, 0, Math.PI*2); ctx.fill();
    const gradT = ctx.createRadialGradient(hx, hy+r*1.5, 0, hx, hy+r*1.5, r);
    gradT.addColorStop(0, colors.extra); gradT.addColorStop(1, colors.bodyBottom);
    ctx.fillStyle = gradT; ctx.beginPath(); ctx.roundRect(hx - r*0.6, hy + r*0.5, r*1.2, r*1.1, r*0.5); ctx.fill();
    ctx.fillStyle = colors.base;
    ctx.beginPath(); ctx.moveTo(hx, hy - r); ctx.quadraticCurveTo(hx - r*0.3, hy - r*1.3, hx - r*0.1, hy - r*1.4); ctx.quadraticCurveTo(hx + r*0.2, hy - r*1.2, hx + r*0.2, hy - r); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy-r*0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.snout;
    ctx.beginPath(); ctx.ellipse(px - r*0.4, py + r*1.5, r*0.2, r*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + r*0.4, py + r*1.5, r*0.2, r*0.1, 0, 0, Math.PI*2); ctx.fill();
}

function drawPenguinBase(ctx, selectedVariant, cx, cy, r, yaw, pitch) {
    const colors = PALETTES.penguin[selectedVariant];
    const hx = cx + yaw * 0.2; const hy = cy + pitch * 0.2;
    const px = cx + yaw * 0.1; const py = cy + pitch * 0.1;
    ctx.fillStyle = colors.bodyBottom;
    ctx.beginPath(); ctx.ellipse(hx - r*0.8, hy + r*0.8, r*0.25, r*0.7, -0.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx + r*0.8, hy + r*0.8, r*0.25, r*0.7, 0.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.bodyTop; ctx.beginPath(); ctx.roundRect(hx - r*0.75, hy + r*0.3, r*1.5, r*1.3, r*0.7); ctx.fill();
    ctx.fillStyle = colors.extra; ctx.beginPath(); ctx.roundRect(hx - r*0.5, hy + r*0.4, r*1.0, r*1.1, r*0.5); ctx.fill();
    const grad = ctx.createRadialGradient(hx, hy-r*0.2, 0, hx, hy, r);
    grad.addColorStop(0, colors.headLight); grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.extra;
    ctx.beginPath(); ctx.arc(hx - r*0.35, hy - r*0.1, r*0.4, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(hx + r*0.35, hy - r*0.1, r*0.4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = colors.snout;
    ctx.beginPath(); ctx.ellipse(px - r*0.4, py + r*1.5, r*0.25, r*0.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + r*0.4, py + r*1.5, r*0.25, r*0.1, 0, 0, Math.PI*2); ctx.fill();
}

export function drawCharacterBase(ctx, character, selectedVariant, cx, cy, radius, yaw, pitch) {
    const draw = {
        bear: drawBearBase,
        cat: drawCatBase,
        moose: drawMooseBase,
        dog: drawDogBase,
        bird: drawBirdBase,
        penguin: drawPenguinBase
    }[character];
    if (draw) draw(ctx, selectedVariant, cx, cy, radius, yaw, pitch);
}
