// ====================== PARTICLE SYSTEM ======================
// Handles visual effects: boost trails, death explosions, eating sparkles

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.maxParticles = this.isMobile ? 150 : 300;
    }

    createBoostParticles(x, y, angle, color) {
        // Limit particle count on mobile
        const particleCount = this.isMobile ? 6 : 12;

        for (let i = 0; i < particleCount; i++) {
            const spread = (Math.random() - 0.5) * 0.8;
            const vel = 2.5 + Math.random() * 3.5;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle + spread) * vel,
                vy: Math.sin(angle + spread) * vel,
                life: 28 + Math.random() * 22,
                maxLife: 28 + Math.random() * 22,
                size: 4.5 + Math.random() * 5,
                color: color,
                alpha: 1,
                type: "boost"
            });
        }

        this.createGlowBurst(x, y, color);
    }

    createGlowBurst(x, y, color) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 18,
                maxLife: 18,
                size: 12 + Math.random() * 18,
                color: color,
                alpha: 0.7,
                type: "glow"
            });
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            p.alpha = p.life / p.maxLife;

            p.vx *= 0.96;
            p.vy *= 0.96;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Hard limit check
        if (this.particles.length > this.maxParticles) {
            this.particles.splice(0, this.particles.length - this.maxParticles);
        }
    }

    draw(ctx, cameraX, cameraY) {
        for (let p of this.particles) {
            const alpha = p.alpha * 0.9;

            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.type === "glow") {
                ctx.shadowBlur = 25;
                ctx.shadowColor = p.color;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x - cameraX, p.y - cameraY, p.size * p.alpha, 0, Math.PI * 2);
                ctx.fill();
            } 
            else {
                ctx.shadowBlur = 12;
                ctx.shadowColor = p.color;
                ctx.fillStyle = "#ffffff";
                
                ctx.beginPath();
                ctx.arc(p.x - cameraX, p.y - cameraY, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
                ctx.fill();

                ctx.shadowBlur = 4;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x - cameraX, p.y - cameraY, p.size * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }
}
