// ====================== PARTICLE SYSTEM (Phaser Compatible) ======================
// Handles visual effects: boost trails, death explosions, eating sparkles
// Updated to use Phaser Graphics API for WebGL performance

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

    // Draw using Phaser Graphics object
    draw(graphics, cameraX, cameraY) {
        if (!graphics) return;

        for (let p of this.particles) {
            const alpha = p.alpha * 0.9;
            const x = p.x - cameraX;
            const y = p.y - cameraY;

            if (p.type === "glow") {
                graphics.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, alpha);
                graphics.fillCircle(x, y, p.size * p.alpha);
            } else {
                // Boost particle: White outer, colored inner
                graphics.fillStyle(0xffffff, alpha);
                graphics.fillCircle(x, y, p.size * (p.life / p.maxLife));
                
                graphics.fillStyle(Phaser.Display.Color.HexStringToColor(p.color).color, alpha);
                graphics.fillCircle(x, y, p.size * 0.45);
            }
        }
    }
}
