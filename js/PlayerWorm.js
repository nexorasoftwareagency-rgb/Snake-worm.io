// ====================== PLAYER WORM CLASS ======================
// Handles player movement, rendering, boost, particles, and Firebase sync

class PlayerWorm {
    constructor(id, startX, startY, color) {
        this.id = id;
        this.isBot = false;
        this.isAlive = true;

        // Position & Movement
        this.head = { 
            x: startX, 
            y: startY, 
            angle: Math.random() * Math.PI * 2 
        };
        
        this.trail = [];           // History of positions for body
        this.segments = [];        // Rendered body points
        this.length = 130;         // Starting length
        
        this.baseSpeed = 5.35;
        this.boostSpeed = 10.2;
        this.currentSpeed = this.baseSpeed;
        
        this.isBoosting = false;
        this.boostDrainRate = 0.32;
        this.minBoostLength = 75;
        
        this.color = color || "#00ffff";
        this.skin = "neon1";
        this.name = "Player";

        // Visuals
        this.particles = new ParticleSystem();
        this.activeEffects = {
            shield: 0,
            magnet: 0,
            speed: 0,
            ghost: 0
        };

        // Sync
        this.lastSyncTime = 0;
        this.syncInterval = this.isMobile ? 70 : 55; // ~14-18 updates per second
    }

    /** Main Update - Call every frame */
    update(mouseX, mouseY, canvasWidth, canvasHeight) {
        if (!this.isAlive) return;

        this.handleMovement(mouseX, mouseY);
        this.handleBoost();
        this.updateTrailAndSegments();
        this.updateBoostParticles();
        this.particles.update();
    }

    handleMovement(mouseX, mouseY) {
        const dx = mouseX - this.head.x;
        const dy = mouseY - this.head.y;
        
        // Dead zone to prevent jitter
        if (Math.hypot(dx, dy) < 15) return;

        let targetAngle = Math.atan2(dy, dx);

        // Smooth turning (slightly slower while boosting for control)
        const turnRate = this.isBoosting ? 0.078 : 0.125;
        
        let angleDiff = targetAngle - this.head.angle;
        angleDiff = (angleDiff + Math.PI) % (Math.PI * 2) - Math.PI;
        this.head.angle += angleDiff * turnRate;

        // Smooth speed transition
        const targetSpeed = this.isBoosting ? this.boostSpeed : this.baseSpeed;
        this.currentSpeed += (targetSpeed - this.currentSpeed) * 0.22;

        // Move head
        this.head.x += Math.cos(this.head.angle) * this.currentSpeed;
        this.head.y += Math.sin(this.head.angle) * this.currentSpeed;
    }

    handleBoost() {
        if (this.isBoosting && this.length > this.minBoostLength) {
            // Drain mass
            this.length -= this.boostDrainRate;

            // Visual feedback
            if (Math.random() < 0.6) {
                this.updateBoostParticles();
            }
        } else {
            this.isBoosting = false;
        }
    }

    updateTrailAndSegments() {
        // Add current head position to trail
        this.trail.push({ x: this.head.x, y: this.head.y });

        // Control worm length (higher density = smoother, lower = better mobile perf)
        const maxPoints = Math.floor(this.length / this.trailDensity);
        while (this.trail.length > maxPoints) {
            this.trail.shift();
        }

        this.segments = this.trail.slice();
    }

    /** Boost Particle Effect */
    updateBoostParticles() {
        if (!this.isBoosting) return;

        // Emit particles from the rear of the worm
        const tailIndex = Math.max(0, Math.floor(this.trail.length * 0.78));
        if (tailIndex >= this.trail.length) return;

        const tail = this.trail[tailIndex];

        // Create boost trail particles
        if (Math.random() < 0.85) {
            this.particles.createBoostParticles(
                tail.x,
                tail.y,
                this.head.angle + Math.PI,     // backward
                this.color
            );
        }
    }

    /** Call this when player presses boost button / holds mouse */
    startBoost() {
        if (this.length > this.minBoostLength + 10 && !this.isBoosting) {
            this.isBoosting = true;
            
            // Play Boost Sound
            if (typeof AudioSystem !== 'undefined') {
                AudioSystem.playBoost();
            }
            
            // Big initial burst
            this.particles.createGlowBurst(this.head.x, this.head.y, this.color);
        }
    }

    stopBoost() {
        this.isBoosting = false;
    }

    /** Eat food */
    eat(amount = 8) {
        this.length += amount;
        
        // Play Eat Sound
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playEat();
        }

        // Eat particles effect
        for (let i = 0; i < 6; i++) {
            this.particles.particles.push({
                x: this.head.x,
                y: this.head.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 22,
                maxLife: 22,
                size: 6,
                color: "#ffff00",
                alpha: 1,
                type: "glow"
            });
        }
    }

    /** Death */
    die() {
        this.isAlive = false;
        
        // Play Death Sound
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playDeath();
        }

        // Create big death explosion
        for (let i = 0; i < 45; i++) {
            this.particles.createGlowBurst(this.head.x, this.head.y, this.color);
        }
    }

    /** Respawn */
    respawn() {
        this.head.x = 800 + Math.random() * 600;
        this.head.y = 800 + Math.random() * 600;
        this.length = 120;
        this.trail = [];
        this.segments = [];
        this.isAlive = true;
        this.isBoosting = false;
        this.activeEffects = { shield: 0, magnet: 0, speed: 0, ghost: 0 };
    }

    /** Drop mass as food on death */
    dropMassAsFood(roomId) {
        const segmentCount = Math.floor(this.segments.length / 6);
        
        for (let i = 0; i < segmentCount; i += 2) {
            if (this.segments[i]) {
                const seg = this.segments[i];
                const foodId = "food_" + Math.random().toString(36).substring(2, 9);
                
                if (typeof firebase !== 'undefined') {
                    firebase.database().ref(`rooms/${roomId}/food/${foodId}`).set({
                        x: seg.x,
                        y: seg.y,
                        value: 9,
                        color: this.color
                    });
                }
            }
        }
    }

    /** Render the worm */
    draw(ctx, cameraX, cameraY) {
        if (!this.isAlive || this.segments.length < 3) return;

        const camX = cameraX;
        const camY = cameraY;

        ctx.shadowBlur = this.isBoosting ? 32 : 22;
        ctx.shadowColor = this.color;

        // Main Body - Very smooth line
        ctx.lineWidth = 19.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = this.color;

        ctx.beginPath();
        ctx.moveTo(this.segments[0].x - camX, this.segments[0].y - camY);

        for (let i = 1; i < this.segments.length; i++) {
            ctx.lineTo(this.segments[i].x - camX, this.segments[i].y - camY);
        }
        ctx.stroke();

        // Highlight layer for premium look
        ctx.shadowBlur = 12;
        ctx.lineWidth = 8.5;
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.beginPath();
        ctx.moveTo(this.segments[0].x - camX, this.segments[0].y - camY);
        for (let i = 1; i < this.segments.length; i += 2) {
            ctx.lineTo(this.segments[i].x - camX, this.segments[i].y - camY);
        }
        ctx.stroke();

        // Head
        ctx.shadowBlur = 30;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.head.x - camX, this.head.y - camY, 14, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        const eyeX = this.head.x - camX + Math.cos(this.head.angle) * 7;
        const eyeY = this.head.y - camY + Math.sin(this.head.angle) * 7;
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(eyeX + 2, eyeY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Draw Magnet Effect */
    drawMagnetEffect(ctx, cameraX, cameraY) {
        if (!this.activeEffects.magnet || this.activeEffects.magnet < Date.now()) return;

        ctx.save();
        ctx.strokeStyle = "#ff00ff";
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#ff00ff";
        ctx.globalAlpha = 0.25 + Math.sin(Date.now() / 100) * 0.1;

        ctx.beginPath();
        ctx.arc(
            this.head.x - cameraX, 
            this.head.y - cameraY, 
            280, 
            0, 
            Math.PI * 2
        );
        ctx.stroke();

        ctx.restore();
    }

    // ====================== FIREBASE SYNC ======================
    syncToFirebase(roomId) {
        const now = Date.now();
        if (now - this.lastSyncTime < this.syncInterval) return;
        
        this.lastSyncTime = now;

        const playerData = {
            x: Math.round(this.head.x * 10) / 10,
            y: Math.round(this.head.y * 10) / 10,
            angle: Math.round(this.head.angle * 100) / 100,
            length: Math.floor(this.length),
            isBoosting: this.isBoosting,
            color: this.color,
            skin: this.skin,
            name: this.name || "Player",
            isBot: false,
            isAlive: this.isAlive,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };

        firebase.database()
            .ref(`rooms/${roomId}/players/${this.id}`)
            .update(playerData)
            .catch(err => console.error("Sync error:", err));
    }

    setupDisconnect(roomId) {
        firebase.database()
            .ref(`rooms/${roomId}/players/${this.id}`)
            .onDisconnect()
            .remove();
    }

    // ====================== COLLISIONS ======================
    checkFoodCollision(foods, roomId) {
        for (let id in foods) {
            const f = foods[id];
            const dx = this.head.x - f.x;
            const dy = this.head.y - f.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 28) {
                this.eat(f.value || 6);
                
                // Remove from Firebase
                if (typeof foodSystem !== 'undefined') {
                    foodSystem.removeFood(roomId, id);
                }
                
                // Chance to spawn new food immediately
                if (Math.random() < 0.4 && typeof foodSystem !== 'undefined') {
                    foodSystem.spawnSingleFood(roomId);
                }
            }
        }
    }

    checkPowerUpCollision(powerUps, roomId) {
        for (let id in powerUps) {
            const pu = powerUps[id];
            const dx = this.head.x - pu.x;
            const dy = this.head.y - pu.y;

            if (Math.hypot(dx, dy) < 32) {
                this.activatePowerUp(pu.type);
                if (typeof PowerUpSystem !== 'undefined') {
                    PowerUpSystem.removePowerUp(roomId, id);
                }
                
                // Visual feedback
                for (let i = 0; i < 20; i++) {
                    this.particles.createGlowBurst(this.head.x, this.head.y, pu.color);
                }
            }
        }
    }

    activatePowerUp(type, duration = 10000) {
        this.activeEffects[type] = Date.now() + duration;

        // Play PowerUp Sound
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playPowerUp();
        }

        if (type === "magnet") {
            for (let i = 0; i < 30; i++) {
                this.particles.createGlowBurst(this.head.x, this.head.y, "#ff00ff");
            }
        }

        if (type === "speed") {
            this.boostSpeed = 13;
        }
    }

    applyMagnetEffect(foods, roomId) {
        if (!this.activeEffects.magnet || this.activeEffects.magnet < Date.now()) {
            return;
        }

        const magnetRadius = 320;
        const pullStrength = 0.28;

        for (let id in foods) {
            const food = foods[id];
            if (!food) continue;

            const dx = this.head.x - food.x;
            const dy = this.head.y - food.y;
            const distance = Math.hypot(dx, dy);

            if (distance < magnetRadius && distance > 25) {
                const force = (magnetRadius - distance) / magnetRadius;
                
                const pullX = (dx / distance) * pullStrength * force;
                const pullY = (dy / distance) * pullStrength * force;

                food.x += pullX * 18;
                food.y += pullY * 18;

                if (distance < 45) {
                    this.eat(food.value || 6);
                    if (typeof foodSystem !== 'undefined') {
                        foodSystem.removeFood(roomId, id);
                    }
                }
            }
        }
    }

    checkCollisions(otherPlayers, bots, roomId) {
        if (!this.isAlive) return;

        const result = Collision.checkAllCollisions(this, otherPlayers, bots);

        if (result.collided) {
            this.die();
            this.dropMassAsFood(roomId);
            
            // Respawn after delay
            setTimeout(() => this.respawn(), 1500);
        }
    }
}
