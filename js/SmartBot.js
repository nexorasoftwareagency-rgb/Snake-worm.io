// ====================== SMART BOT CLASS ======================
// AI-controlled worm with random thinking, hunting, and avoidance

class SmartBot {
    constructor(id, startX, startY, roomId) {
        this.id = id || "bot_" + Math.random().toString(36).substring(2, 10);
        this.roomId = roomId;
        this.isBot = true;
        this.isAlive = true;

        // Position & Movement
        this.head = { 
            x: startX, 
            y: startY, 
            angle: Math.random() * Math.PI * 2 
        };
        
        this.trail = [];
        this.segments = [];
        this.length = 90 + Math.random() * 80;
        
        this.speed = 4.3;
        this.boostSpeed = 8.1;
        this.isBoosting = false;
        
        this.color = this.getRandomNeonColor();
        this.skin = "neon" + Math.floor(Math.random() * 8 + 1);
        this.name = "Bot-" + Math.floor(Math.random() * 900 + 100);

        // AI Variables
        this.target = null;
        this.mood = "explore";           // explore, grow, hunt, escape
        this.lastThinkTime = 0;
        this.thinkInterval = 650;
        this.lastSyncTime = 0;

        // Visuals
        this.particles = new ParticleSystem();
        
        // Mobile Optimization
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.trailDensity = this.isMobile ? 2.8 : 2.2;
    }

    getRandomNeonColor() {
        const colors = ["#00ffff", "#ff00ff", "#ffff00", "#00ff88", "#ff8800", "#ff0088", "#88ff00"];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /** Main Update - Called every frame */
    update(gameState) {
        if (!this.isAlive) return;

        const now = Date.now();
        
        // Thinking (Random + Strategic)
        if (now - this.lastThinkTime > this.thinkInterval) {
            this.think(gameState);
            this.lastThinkTime = now;
            this.thinkInterval = 400 + Math.random() * 600; // Random thinking speed
        }

        this.moveTowardTarget();
        this.handleBoost();
        this.updateTrailAndSegments();
        this.updateBoostParticles();
        this.particles.update();
        this.syncToFirebaseThrottled();
    }

    /** Core AI Thinking with Vision */
    think(gameState) {
        const { players = {}, bots = {}, food = {} } = gameState;
        const allEntities = [...Object.values(players), ...Object.values(bots)];
        const allFood = Object.values(food);

        let nearestFood = null;
        let nearestThreat = null;
        let bestPrey = null;

        let foodDist = Infinity;
        let threatDist = Infinity;
        let preyDist = Infinity;

        const myPos = this.head;
        const mySize = this.length;

        // === Vision: Scan everything ===
        // Food
        for (let f of allFood) {
            const dist = this.getDistance(myPos, f);
            if (dist < foodDist) {
                foodDist = dist;
                nearestFood = f;
            }
        }

        // Players & Other Bots
        for (let entity of allEntities) {
            if (entity.id === this.id || !entity.isAlive) continue;

            const dist = this.getDistance(myPos, entity.head || entity);

            // Threat detection
            if (entity.length > mySize * 1.4 && dist < 420) {
                if (dist < threatDist) {
                    threatDist = dist;
                    nearestThreat = entity;
                }
            }
            // Prey detection (good target to hunt)
            else if (entity.length < mySize * 0.72 && dist < 520) {
                if (dist < preyDist) {
                    preyDist = dist;
                    bestPrey = entity;
                }
            }
        }

        // === Decision Making ===
        if (nearestThreat && threatDist < 340) {
            this.mood = "escape";
            this.target = {
                x: myPos.x * 2 - nearestThreat.head.x,
                y: myPos.y * 2 - nearestThreat.head.y
            };
            this.isBoosting = true;

        } else if (bestPrey && preyDist < 480 && mySize > 140) {
            this.mood = "hunt";
            this.target = bestPrey.head || bestPrey;
            this.isBoosting = Math.random() < 0.65;

        } else if (nearestFood && foodDist < 650) {
            this.mood = "grow";
            this.target = nearestFood;
            this.isBoosting = false;

        } else {
            // Random purposeful exploration
            this.mood = "explore";
            if (!this.target || this.getDistance(myPos, this.target) < 120) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 200 + Math.random() * 350;
                this.target = {
                    x: myPos.x + Math.cos(angle) * dist,
                    y: myPos.y + Math.sin(angle) * dist
                };
            }
            this.isBoosting = Math.random() < 0.12;
        }
    }

    moveTowardTarget() {
        if (!this.target) return;

        const dx = this.target.x - this.head.x;
        const dy = this.target.y - this.head.y;
        let targetAngle = Math.atan2(dy, dx);

        // Smooth turning
        let diff = targetAngle - this.head.angle;
        diff = (diff + Math.PI) % (Math.PI * 2) - Math.PI;
        this.head.angle += diff * 0.092;

        // Move
        const currentSpeed = this.isBoosting ? this.boostSpeed : this.speed;
        this.head.x += Math.cos(this.head.angle) * currentSpeed;
        this.head.y += Math.sin(this.head.angle) * currentSpeed;
    }

    handleBoost() {
        if (this.isBoosting && this.length > 75) {
            this.length -= 0.25;
        } else {
            this.isBoosting = false;
        }
    }

    updateTrailAndSegments() {
        this.trail.push({ x: this.head.x, y: this.head.y });

        const maxPoints = Math.floor(this.length / this.trailDensity);
        if (this.trail.length > maxPoints) this.trail.shift();

        this.segments = this.trail.slice();
    }

    updateBoostParticles() {
        if (!this.isBoosting) return;

        const tailIndex = Math.floor(this.trail.length * 0.78);
        if (tailIndex < 1) return;

        const tail = this.trail[tailIndex];

        if (Math.random() < 0.8) {
            this.particles.createBoostParticles(
                tail.x, 
                tail.y, 
                this.head.angle + Math.PI, 
                this.color
            );
        }
    }

    getDistance(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    syncToFirebaseThrottled() {
        const now = Date.now();
        if (now - this.lastSyncTime < 60) return; // ~16 updates per second max

        this.lastSyncTime = now;

        const botData = {
            x: this.head.x,
            y: this.head.y,
            angle: this.head.angle,
            length: Math.floor(this.length),
            isBoosting: this.isBoosting,
            color: this.color,
            skin: this.skin,
            name: this.name,
            isBot: true,
            isAlive: this.isAlive,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };

        firebase.database().ref(`rooms/${this.roomId}/players/${this.id}`)
            .update(botData);
    }

    /** Render the bot */
    draw(ctx, cameraX, cameraY) {
        if (!this.isAlive || this.segments.length < 3) return;

        ctx.shadowBlur = this.isBoosting ? 28 : 18;
        ctx.shadowColor = this.color;

        ctx.lineWidth = 18;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = this.color;

        ctx.beginPath();
        ctx.moveTo(this.segments[0].x - cameraX, this.segments[0].y - cameraY);
        for (let i = 1; i < this.segments.length; i++) {
            ctx.lineTo(this.segments[i].x - cameraX, this.segments[i].y - cameraY);
        }
        ctx.stroke();

        // Head
        ctx.shadowBlur = 25;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.head.x - cameraX, this.head.y - cameraY, 13, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(
            this.head.x - cameraX + Math.cos(this.head.angle) * 6, 
            this.head.y - cameraY + Math.sin(this.head.angle) * 6, 
            5, 0, Math.PI * 2
        );
        ctx.fill();
    }

    checkFoodCollision(foods, roomId) {
        for (let id in foods) {
            const f = foods[id];
            const dx = this.head.x - f.x;
            const dy = this.head.y - f.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 28) {
                this.length += f.value || 6;
                if (typeof foodSystem !== 'undefined') {
                    foodSystem.removeFood(roomId, id);
                }
            }
        }
    }
}
