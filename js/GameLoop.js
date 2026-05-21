// ====================== PHASER GAME SCENE (Visuals Upgraded) ======================

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    create() {
        // 1. Setup World
        this.ARENA_SIZE = 3000;
        this.physics.world.setBounds(0, 0, this.ARENA_SIZE, this.ARENA_SIZE);
        
        // 2. Background Grid (Graphics)
        this.gridGraphics = this.add.graphics();
        this.drawGrid();

        // 3. Minimap Setup
        this.setupMinimap();

        // 4. Graphics Objects for Rendering (Performance)
        this.foodGraphics = this.add.graphics().setDepth(1);
        this.particleGraphics = this.add.graphics().setDepth(20);

        // 5. Input
        this.input.on('pointermove', (pointer) => {
            this.mouseWorldX = pointer.worldX;
            this.mouseWorldY = pointer.worldY;
        });

        // Boost Button
        const boostBtn = document.getElementById('boost-btn');
        boostBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.isBoosting = true; });
        boostBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.isBoosting = false; });
        boostBtn.addEventListener('mousedown', () => this.isBoosting = true);
        boostBtn.addEventListener('mouseup', () => this.isBoosting = false);

        // 6. Game State
        this.player = null;
        this.otherPlayers = {};
        this.bots = {};
        this.currentFoods = {};
        this.currentPowerUps = {};
        this.isBoosting = false;
        this.mouseWorldX = this.ARENA_SIZE / 2;
        this.mouseWorldY = this.ARENA_SIZE / 2;

        // 7. Init Systems
        this.initGame();
    }

    update(time, delta) {
        if (!this.player || !this.player.isAlive) return;

        // Update Player
        this.player.update(this.mouseWorldX, this.mouseWorldY, this.scale.width, this.scale.height);
        this.player.syncToFirebase(this.roomId);
        this.player.checkFoodCollision(this.currentFoods, this.roomId);
        this.player.checkPowerUpCollision(this.currentPowerUps, this.roomId);
        this.player.applyMagnetEffect(this.currentFoods, this.roomId);
        this.player.checkCollisions(this.otherPlayers, this.bots, this.roomId);

        // Update Bots
        const gameState = { players: this.otherPlayers, bots: this.bots, food: this.currentFoods };
        Object.values(this.bots).forEach(bot => {
            bot.update(gameState);
            bot.checkFoodCollision(this.currentFoods, this.roomId);
        });

        // Update Camera (Smooth Follow)
        this.cameras.main.startFollow(this.player.head, true, 0.1, 0.1);
        
        // Zoom based on length
        const targetZoom = Math.max(0.5, 1 - (this.player.length - 120) / 2000);
        this.cameras.main.setZoom(Phaser.Math.Linear(this.cameras.main.zoom, targetZoom, 0.05));

        // Update UI
        document.getElementById('score-val').textContent = Math.floor(this.player.length * 10);

        // Draw Minimap
        this.drawMinimap();
    }

    initGame() {
        const urlParams = new URLSearchParams(window.location.search);
        this.roomId = urlParams.get('room');
        const playerId = localStorage.getItem('wormPlayerId') || "player_" + Math.random().toString(36).substring(2, 11);
        const playerSkin = localStorage.getItem('wormSkin') || "#00ffff";

        if (!this.roomId) {
            alert("No room specified!");
            window.location.href = "index.html";
            return;
        }

        document.getElementById('room-id-display').textContent = this.roomId;

        // Create Player
        this.player = new PlayerWorm(playerId, this.ARENA_SIZE / 2, this.ARENA_SIZE / 2, playerSkin);
        this.player.setupDisconnect(this.roomId);

        // Listen to Players
        firebase.database().ref(`rooms/${this.roomId}/players`).on('value', (snapshot) => {
            const data = snapshot.val() || {};
            this.otherPlayers = {};
            this.bots = {};

            Object.keys(data).forEach(id => {
                if (id === this.player.id) return;
                if (data[id].isBot) {
                    if (!this.bots[id]) {
                        this.bots[id] = new SmartBot(id, data[id].x, data[id].y, this.roomId);
                    }
                    // Update Bot State
                    this.bots[id].head.x = data[id].x;
                    this.bots[id].head.y = data[id].y;
                    this.bots[id].head.angle = data[id].angle;
                    this.bots[id].length = data[id].length;
                    this.bots[id].isBoosting = data[id].isBoosting;
                    this.bots[id].isAlive = data[id].isAlive !== false;
                } else {
                    this.otherPlayers[id] = data[id];
                }
            });

            this.updateLeaderboard(data);
            this.autoFillBots(this.roomId);
        });

        // Listen to Food
        foodSystem.listenToFood(this.roomId, (foods) => {
            this.currentFoods = foods;
        });
        foodSystem.startFoodSpawner(this.roomId);

        // Listen to PowerUps
        PowerUpSystem.listenToPowerUps(this.roomId, (powerUps) => {
            this.currentPowerUps = powerUps;
        });
        PowerUpSystem.startSpawner(this.roomId);

        // Hide Loading Screen
        document.getElementById('loading-screen').style.display = 'none';
    }

    drawGrid() {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(2, 0xffffff, 0.08);
        const gridSize = 50;
        for (let x = 0; x <= this.ARENA_SIZE; x += gridSize) {
            this.gridGraphics.moveTo(x, 0);
            this.gridGraphics.lineTo(x, this.ARENA_SIZE);
        }
        for (let y = 0; y <= this.ARENA_SIZE; y += gridSize) {
            this.gridGraphics.moveTo(0, y);
            this.gridGraphics.lineTo(this.ARENA_SIZE, y);
        }
        this.gridGraphics.strokePath();
    }

    setupMinimap() {
        this.minimapSize = 150;
        this.minimapPadding = 20;
        this.minimapX = this.scale.width - this.minimapSize - this.minimapPadding;
        this.minimapY = this.scale.height - this.minimapSize - this.minimapPadding;
        
        this.minimapGraphics = this.add.graphics().setDepth(100);
    }

    drawMinimap() {
        if (!this.minimapGraphics) return;

        this.minimapGraphics.clear();
        
        // Background & Border
        this.minimapGraphics.fillStyle(0x0a001f, 0.8);
        this.minimapGraphics.fillRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);
        this.minimapGraphics.lineStyle(2, 0xffffff, 0.5);
        this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);

        const scale = this.minimapSize / this.ARENA_SIZE;

        // Draw Food (Limit to 50)
        const foodEntries = Object.values(this.currentFoods);
        const limit = 50;
        for (let i = 0; i < Math.min(foodEntries.length, limit); i++) {
            const f = foodEntries[i];
            this.minimapGraphics.fillStyle(0xffff00, 0.6);
            this.minimapGraphics.fillRect(this.minimapX + f.x * scale, this.minimapY + f.y * scale, 2, 2);
        }

        // Draw Other Players
        Object.values(this.otherPlayers).forEach(p => {
            this.minimapGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(p.color || '#00ffff').color, 1);
            this.minimapGraphics.fillCircle(this.minimapX + p.x * scale, this.minimapY + p.y * scale, 3);
        });

        // Draw Bots
        Object.values(this.bots).forEach(b => {
            this.minimapGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(b.color || '#ff00ff').color, 1);
            this.minimapGraphics.fillCircle(this.minimapX + b.head.x * scale, this.minimapY + b.head.y * scale, 2);
        });

        // Draw Player
        if (this.player && this.player.isAlive) {
            this.minimapGraphics.fillStyle(0xffffff, 1);
            this.minimapGraphics.fillCircle(this.minimapX + this.player.head.x * scale, this.minimapY + this.player.head.y * scale, 4);
            
            // Viewport Rectangle
            const cam = this.cameras.main;
            const viewX = this.minimapX + (cam.scrollX / this.ARENA_SIZE) * this.minimapSize;
            const viewY = this.minimapY + (cam.scrollY / this.ARENA_SIZE) * this.minimapSize;
            const viewW = (cam.width / cam.zoom / this.ARENA_SIZE) * this.minimapSize;
            const viewH = (cam.height / cam.zoom / this.ARENA_SIZE) * this.minimapSize;

            this.minimapGraphics.lineStyle(1, 0xffffff, 0.8);
            this.minimapGraphics.strokeRect(viewX, viewY, viewW, viewH);
        }
    }

    updateLeaderboard(playersData) {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        list.innerHTML = '';
        const sorted = Object.values(playersData)
            .filter(p => p.isAlive !== false)
            .sort((a, b) => (b.length || 0) - (a.length || 0))
            .slice(0, 10);

        sorted.forEach((p, index) => {
            const li = document.createElement('li');
            if (p.id === this.player?.id) li.className = 'me';
            li.innerHTML = `<span>${index + 1}. ${p.name || 'Unknown'}</span><span>${Math.floor(p.length || 0)}</span>`;
            list.appendChild(li);
        });
    }

    async autoFillBots(roomId) {
        const playersRef = firebase.database().ref(`rooms/${roomId}/players`);
        const snapshot = await playersRef.once('value');
        const data = snapshot.val() || {};
        const currentCount = Object.keys(data).length;
        const needed = 15 - currentCount;

        if (needed <= 0) return;

        for (let i = 0; i < needed; i++) {
            const botId = "bot_" + Math.random().toString(36).substring(2, 10);
            const botData = {
                x: this.ARENA_SIZE / 2 + (Math.random() - 0.5) * 1000,
                y: this.ARENA_SIZE / 2 + (Math.random() - 0.5) * 1000,
                angle: Math.random() * Math.PI * 2,
                length: 100 + Math.random() * 50,
                color: ["#00ffff", "#ff00ff", "#ffff00", "#00ff88"][Math.floor(Math.random() * 4)],
                name: "Bot-" + Math.floor(Math.random() * 999),
                isBot: true,
                isAlive: true,
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            };
            await playersRef.child(botId).set(botData);
        }
    }

    render() {
        const cam = this.cameras.main;
        
        // Calculate visible world bounds (Camera Viewport)
        const viewX = cam.scrollX;
        const viewY = cam.scrollY;
        const viewW = cam.width / cam.zoom;
        const viewH = cam.height / cam.zoom;
        
        // Buffer: Render slightly outside the screen to prevent popping when entering view
        const buffer = 200; 

        // 1. Render Food (Glowing Orbs) - CULLED (Only Visible)
        this.foodGraphics.clear();
        const time = this.time.now;
        Object.values(this.currentFoods).forEach(food => {
            // Optimization: Skip drawing if outside camera view
            if (food.x < viewX - buffer || food.x > viewX + viewW + buffer ||
                food.y < viewY - buffer || food.y > viewY + viewH + buffer) {
                return; 
            }
            
            const colorHex = Phaser.Display.Color.HexStringToColor(food.color || '#ffff00').color;
            const pulse = 1 + Math.sin(time * 0.005 + food.x) * 0.2;
            
            // Glow
            this.foodGraphics.fillStyle(colorHex, 0.3);
            this.foodGraphics.fillCircle(food.x, food.y, 10 * pulse);
            
            // Core
            this.foodGraphics.fillStyle(colorHex, 1);
            this.foodGraphics.fillCircle(food.x, food.y, 6);
            
            // Shine
            this.foodGraphics.fillStyle(0xffffff, 0.6);
            this.foodGraphics.fillCircle(food.x - 2, food.y - 2, 2);
        });

        // 2. Render Particles
        this.particleGraphics.clear();
        if (this.player && this.player.isAlive) {
            this.player.particles.draw(this.particleGraphics, cam.scrollX, cam.scrollY);
        }
        Object.values(this.bots).forEach(bot => {
            if (bot.isAlive) {
                bot.particles.draw(this.particleGraphics, cam.scrollX, cam.scrollY);
            }
        });

        // 3. Render Bots - CULLED (Only Visible)
        if (!this.wormGraphics) {
            this.wormGraphics = this.add.graphics().setDepth(10);
        }
        this.wormGraphics.clear();

        Object.values(this.bots).forEach(bot => {
            if (!bot.isAlive) return;
            
            // Optimization: Skip drawing bot if head is far outside view
            if (bot.head.x < viewX - buffer || bot.head.x > viewX + viewW + buffer ||
                bot.head.y < viewY - buffer || bot.head.y > viewY + viewH + buffer) {
                return;
            }
            this.renderWorm(bot);
        });

        // 4. Render Player (Always visible)
        if (this.player && this.player.isAlive) {
            this.renderWorm(this.player);
        }
    }

    renderWorm(worm) {
        if (!worm.isAlive || worm.segments.length < 3) return;

        // Use a temporary graphics object for each worm? No, too slow.
        // We need to draw all worms on one graphics object? 
        // Problem: `graphics` is persistent. We need to clear it every frame.
        // But we can't clear `this.foodGraphics` because we need food.
        // Solution: Create a `wormGraphics` object in `create` and clear/redraw all worms every frame.
        // Let's add `this.wormGraphics` in `create`.
        if (!this.wormGraphics) {
            this.wormGraphics = this.add.graphics().setDepth(10);
        }
        this.wormGraphics.clear();

        const color = Phaser.Display.Color.HexStringToColor(worm.color).color;
        const highlightColor = Phaser.Display.Color.GetColor(255, 255, 255);

        // 1. Outer Glow (Soft shadow)
        this.wormGraphics.lineStyle(24, color, 0.2);
        this.wormGraphics.lineCap = 'round';
        this.wormGraphics.lineJoin = 'round';
        this.wormGraphics.beginPath();
        this.wormGraphics.moveTo(worm.segments[0].x, worm.segments[0].y);
        for (let i = 1; i < worm.segments.length; i++) {
            this.wormGraphics.lineTo(worm.segments[i].x, worm.segments[i].y);
        }
        this.wormGraphics.strokePath();

        // 2. Main Body
        this.wormGraphics.lineStyle(18, color, 1);
        this.wormGraphics.beginPath();
        this.wormGraphics.moveTo(worm.segments[0].x, worm.segments[0].y);
        for (let i = 1; i < worm.segments.length; i++) {
            this.wormGraphics.lineTo(worm.segments[i].x, worm.segments[i].y);
        }
        this.wormGraphics.strokePath();

        // 3. Highlight (Top shine for 3D effect)
        this.wormGraphics.lineStyle(8, highlightColor, 0.4);
        this.wormGraphics.beginPath();
        this.wormGraphics.moveTo(worm.segments[0].x, worm.segments[0].y);
        for (let i = 1; i < worm.segments.length; i += 2) { 
            this.wormGraphics.lineTo(worm.segments[i].x, worm.segments[i].y);
        }
        this.wormGraphics.strokePath();

        // 4. Head
        this.wormGraphics.fillStyle(color, 1);
        this.wormGraphics.fillCircle(worm.head.x, worm.head.y, 15);
        
        // 5. Eyes
        const eyeOffset = 6;
        const eyeSize = 4;
        const pupilSize = 2;
        
        const angle = worm.head.angle;
        const leftEyeX = worm.head.x + Math.cos(angle - 0.5) * eyeOffset;
        const leftEyeY = worm.head.y + Math.sin(angle - 0.5) * eyeOffset;
        const rightEyeX = worm.head.x + Math.cos(angle + 0.5) * eyeOffset;
        const rightEyeY = worm.head.y + Math.sin(angle + 0.5) * eyeOffset;

        // Whites
        this.wormGraphics.fillStyle(0xffffff, 1);
        this.wormGraphics.fillCircle(leftEyeX, leftEyeY, eyeSize);
        this.wormGraphics.fillCircle(rightEyeX, rightEyeY, eyeSize);

        // Pupils
        this.wormGraphics.fillStyle(0x000000, 1);
        this.wormGraphics.fillCircle(leftEyeX + Math.cos(angle)*1.5, leftEyeY + Math.sin(angle)*1.5, pupilSize);
        this.wormGraphics.fillCircle(rightEyeX + Math.cos(angle)*1.5, rightEyeY + Math.sin(angle)*1.5, pupilSize);
    }
}

// Phaser Config
const config = {
    type: Phaser.AUTO, // WebGL if available, else Canvas
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#110022', // Deeper purple for better neon contrast
    scene: MainScene,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
        pixelArt: false,
        antialias: true
    }
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
