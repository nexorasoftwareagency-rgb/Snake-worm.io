// ====================== PHASER GAME SCENE ======================

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

        // 4. Input
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

        // 5. Game State
        this.player = null;
        this.otherPlayers = {};
        this.bots = {};
        this.currentFoods = {};
        this.currentPowerUps = {};
        this.isBoosting = false;
        this.mouseWorldX = this.ARENA_SIZE / 2;
        this.mouseWorldY = this.ARENA_SIZE / 2;

        // 6. Init Systems
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

        // Create Player Graphics Object
        this.playerGraphics = this.add.graphics();
        this.playerGraphics.setDepth(10);

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
                        // Create Bot Graphics
                        this.bots[id].graphics = this.add.graphics();
                        this.bots[id].graphics.setDepth(5);
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
        this.gridGraphics.lineStyle(2, 0xffffff, 0.05);
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
        // Position: Bottom Right
        this.minimapX = this.scale.width - this.minimapSize - this.minimapPadding;
        this.minimapY = this.scale.height - this.minimapSize - this.minimapPadding;
        
        this.minimapGraphics = this.add.graphics().setDepth(100);
        
        // Background
        this.minimapGraphics.fillStyle(0x0a001f, 0.8);
        this.minimapGraphics.fillRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);
        
        // Border
        this.minimapGraphics.lineStyle(2, 0xffffff, 0.5);
        this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);
    }

    drawMinimap() {
        if (!this.minimapGraphics) return;

        // Clear dynamic content (keep background/border if needed, but easier to redraw all)
        // Actually, let's just clear the inner area to save performance
        this.minimapGraphics.clear();
        
        // Redraw Background & Border
        this.minimapGraphics.fillStyle(0x0a001f, 0.8);
        this.minimapGraphics.fillRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);
        this.minimapGraphics.lineStyle(2, 0xffffff, 0.5);
        this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, this.minimapSize, this.minimapSize);

        const scale = this.minimapSize / this.ARENA_SIZE;

        // Draw Food (Limit to 50 for performance)
        const foodEntries = Object.values(this.currentFoods);
        const limit = 50;
        for (let i = 0; i < Math.min(foodEntries.length, limit); i++) {
            const f = foodEntries[i];
            this.minimapGraphics.fillStyle(0xffff00, 0.6);
            this.minimapGraphics.fillRect(
                this.minimapX + f.x * scale, 
                this.minimapY + f.y * scale, 
                2, 2
            );
        }

        // Draw Other Players
        Object.values(this.otherPlayers).forEach(p => {
            this.minimapGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(p.color || '#00ffff').color, 1);
            this.minimapGraphics.fillCircle(
                this.minimapX + p.x * scale, 
                this.minimapY + p.y * scale, 
                3
            );
        });

        // Draw Bots
        Object.values(this.bots).forEach(b => {
            this.minimapGraphics.fillStyle(Phaser.Display.Color.HexStringToColor(b.color || '#ff00ff').color, 1);
            this.minimapGraphics.fillCircle(
                this.minimapX + b.head.x * scale, 
                this.minimapY + b.head.y * scale, 
                2
            );
        });

        // Draw Player
        if (this.player && this.player.isAlive) {
            this.minimapGraphics.fillStyle(0xffffff, 1);
            this.minimapGraphics.fillCircle(
                this.minimapX + this.player.head.x * scale, 
                this.minimapY + this.player.head.y * scale, 
                4
            );
            
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
        const needed = 15 - currentCount; // Fill up to 15

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
        // Render Player
        if (this.player && this.player.isAlive) {
            this.renderWorm(this.player, this.playerGraphics);
            this.player.particles.draw(this, this.cameras.main.scrollX, this.cameras.main.scrollY);
        }

        // Render Bots
        Object.values(this.bots).forEach(bot => {
            if (bot.isAlive && bot.graphics) {
                this.renderWorm(bot, bot.graphics);
                bot.particles.draw(this, this.cameras.main.scrollX, this.cameras.main.scrollY);
            }
        });

        // Render Food
        Object.values(this.currentFoods).forEach(food => {
            this.add.circle(food.x, food.y, 6, Phaser.Display.Color.HexStringToColor(food.color || '#ffff00').color).setDepth(1);
        });
        
        // Note: In a real game, you'd pool these circle objects for performance instead of creating new ones every frame.
        // For now, this is a simple implementation.
    }

    renderWorm(worm, graphics) {
        if (!worm.isAlive || worm.segments.length < 3) return;

        graphics.clear();
        
        // Glow
        graphics.lineStyle(20, Phaser.Display.Color.HexStringToColor(worm.color).color, 0.3);
        graphics.beginPath();
        graphics.moveTo(worm.segments[0].x, worm.segments[0].y);
        for (let i = 1; i < worm.segments.length; i++) {
            graphics.lineTo(worm.segments[i].x, worm.segments[i].y);
        }
        graphics.strokePath();

        // Body
        graphics.lineStyle(16, Phaser.Display.Color.HexStringToColor(worm.color).color, 1);
        graphics.lineCap = 'round';
        graphics.lineJoin = 'round';
        graphics.beginPath();
        graphics.moveTo(worm.segments[0].x, worm.segments[0].y);
        for (let i = 1; i < worm.segments.length; i++) {
            graphics.lineTo(worm.segments[i].x, worm.segments[i].y);
        }
        graphics.strokePath();

        // Head
        graphics.fillStyle(Phaser.Display.Color.HexStringToColor(worm.color).color, 1);
        graphics.fillCircle(worm.head.x, worm.head.y, 14);
    }
}

// Phaser Config
const config = {
    type: Phaser.AUTO, // WebGL if available, else Canvas
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0a001f',
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
