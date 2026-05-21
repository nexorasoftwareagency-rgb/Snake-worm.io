// ====================== GAME LOOP & INITIALIZATION ======================
// Main game loop, input handling, Firebase listeners, and rendering

// ====================== CONSTANTS & CONFIG ======================
const ARENA_SIZE = 3000; // Size of the game world
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Performance Settings
const PERF = {
    trailDensity: isMobile ? 2.8 : 2.2,    // Higher = fewer segments (better perf)
    maxParticles: isMobile ? 150 : 300,
    syncRate: isMobile ? 70 : 55,          // ms between updates
    minimapFoodLimit: isMobile ? 50 : 100  // Max food dots on minimap
};

let canvas, ctx;
let minimapCanvas, minimapCtx;
let player;
let otherPlayers = {};
let bots = {};
let currentFoods = {};
let currentPowerUps = {};
let roomId = "";
let lastTime = 0;
let camera = { x: 0, y: 0, zoom: 1 };
let mouseWorldX = 0, mouseWorldY = 0;
let isBoosting = false;

function initGame() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    // Minimap Init
    minimapCanvas = document.getElementById('minimap');
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCanvas.width = 150;
    minimapCanvas.height = 150;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize Mute Button State
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.textContent = '🔊';
    }

    // Get room from URL
    const urlParams = new URLSearchParams(window.location.search);
    roomId = urlParams.get('room');
    const playerId = localStorage.getItem('wormPlayerId') || "player_" + Math.random().toString(36).substring(2, 11);
    const playerSkin = localStorage.getItem('wormSkin') || "#00ffff";

    if (!roomId) {
        alert("No room specified!");
        window.location.href = "index.html";
        return;
    }

    document.getElementById('room-id-display').textContent = roomId;

    // Create Player
    player = new PlayerWorm(playerId, ARENA_SIZE / 2, ARENA_SIZE / 2, playerSkin);
    player.setupDisconnect(roomId);

    // Initialize Food System
    foodSystem.listenToFood(roomId, (foods) => {
        currentFoods = foods;
    });
    foodSystem.startFoodSpawner(roomId);

    // Initialize PowerUp System
    PowerUpSystem.listenToPowerUps(roomId, (powerUps) => {
        currentPowerUps = powerUps;
    });
    PowerUpSystem.startSpawner(roomId);

    // Listen to other players & bots
    firebase.database().ref(`rooms/${roomId}/players`).on('value', (snapshot) => {
        const data = snapshot.val() || {};
        
        otherPlayers = {};
        bots = {};
        
        Object.keys(data).forEach(id => {
            if (id === player.id) {
                // Update local player from server if needed
                return;
            }
            if (data[id].isBot) {
                if (!bots[id]) {
                    bots[id] = new SmartBot(id, data[id].x, data[id].y, roomId);
                }
                // Update bot state
                bots[id].head.x = data[id].x;
                bots[id].head.y = data[id].y;
                bots[id].head.angle = data[id].angle;
                bots[id].length = data[id].length;
                bots[id].isBoosting = data[id].isBoosting;
                bots[id].isAlive = data[id].isAlive !== false;
            } else {
                otherPlayers[id] = data[id];
            }
        });

        updateLeaderboard(data);
    });

    // Input Setup
    setupInput();

    // Hide loading screen
    document.getElementById('loading-screen').style.display = 'none';

    // Start Game Loop
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (!player || !player.isAlive) return;

    // Update Player
    player.update(mouseWorldX, mouseWorldY, canvas.width, canvas.height);
    player.syncToFirebase(roomId);
    player.checkFoodCollision(currentFoods, roomId);
    player.checkPowerUpCollision(currentPowerUps, roomId);
    player.applyMagnetEffect(currentFoods, roomId);
    player.checkCollisions(otherPlayers, bots, roomId);

    // Update Bots
    const gameState = { players: otherPlayers, bots: bots, food: currentFoods };
    Object.values(bots).forEach(bot => {
        bot.update(gameState);
        bot.checkFoodCollision(currentFoods, roomId);
    });

    // Update Camera
    updateCamera();

    // Update UI
    document.getElementById('score-val').textContent = Math.floor(player.length * 10);
}

function render() {
    // Clear Canvas
    ctx.fillStyle = '#0a001f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw Grid
    drawGrid();

    // Draw Food
    // Optimization: Only draw food if not too many or if close to camera (simple culling)
    // For now, draw all but optimize later if needed
    Object.values(currentFoods).forEach(food => {
        ctx.fillStyle = food.color || '#ffff00';
        ctx.shadowBlur = 15;
        ctx.shadowColor = food.color || '#ffff00';
        ctx.beginPath();
        ctx.arc(food.x, food.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // Draw PowerUps
    Object.values(currentPowerUps).forEach(pu => {
        ctx.fillStyle = pu.color || '#00ff88';
        ctx.shadowBlur = 20;
        ctx.shadowColor = pu.color || '#00ff88';
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Icon
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(PowerUpSystem.getIcon(pu.type), pu.x, pu.y);
    });

    // Draw Other Players
    Object.values(otherPlayers).forEach(p => {
        if (p.segments && p.segments.length > 2) {
            ctx.strokeStyle = p.color || '#00ffff';
            ctx.lineWidth = 15;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(p.segments[0].x, p.segments[0].y);
            for (let i = 1; i < p.segments.length; i++) {
                ctx.lineTo(p.segments[i].x, p.segments[i].y);
            }
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color || '#00ffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Draw Bots
    Object.values(bots).forEach(bot => {
        bot.draw(ctx, 0, 0);
    });

    // Draw Local Player
    if (player && player.isAlive) {
        player.draw(ctx, 0, 0);
        player.drawMagnetEffect(ctx, 0, 0);
        player.particles.draw(ctx, 0, 0);
    }

    ctx.restore();

    // Draw Minimap (Overlay)
    drawMinimap();
}

function drawGrid() {
    const gridSize = 50;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    const endX = startX + canvas.width / camera.zoom + gridSize;
    const endY = startY + canvas.height / camera.zoom + gridSize;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let x = startX; x < endX; x += gridSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }
    for (let y = startY; y < endY; y += gridSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }
    ctx.stroke();
}

function updateCamera() {
    const targetX = player.head.x - canvas.width / (2 * camera.zoom);
    const targetY = player.head.y - canvas.height / (2 * camera.zoom);
    
    camera.x += (targetX - camera.x) * 0.12;
    camera.y += (targetY - camera.y) * 0.12;
    
    // Zoom based on length
    const targetZoom = Math.max(0.5, 1 - (player.length - 120) / 2000);
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function setupInput() {
    canvas.addEventListener('mousemove', (e) => {
        mouseWorldX = camera.x + e.clientX / camera.zoom;
        mouseWorldY = camera.y + e.clientY / camera.zoom;
    });

    canvas.addEventListener('mousedown', () => {
        player.startBoost();
        isBoosting = true;
    });
    canvas.addEventListener('mouseup', () => {
        player.stopBoost();
        isBoosting = false;
    });
    canvas.addEventListener('mouseleave', () => {
        player.stopBoost();
        isBoosting = false;
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        mouseWorldX = camera.x + touch.clientX / camera.zoom;
        mouseWorldY = camera.y + touch.clientY / camera.zoom;
        player.startBoost();
        isBoosting = true;
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        mouseWorldX = camera.x + touch.clientX / camera.zoom;
        mouseWorldY = camera.y + touch.clientY / camera.zoom;
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
        player.stopBoost();
        isBoosting = false;
    });

    // Boost Button (Mobile)
    const boostBtn = document.getElementById('boost-btn');
    if (boostBtn) {
        boostBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            player.startBoost();
        });
        boostBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            player.stopBoost();
        });
    }

    // Keyboard Support
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            player.startBoost();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            player.stopBoost();
        }
    });
}

function updateLeaderboard(playersData) {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    
    list.innerHTML = '';

    const sorted = Object.values(playersData)
        .filter(p => p.isAlive !== false)
        .sort((a, b) => (b.length || 0) - (a.length || 0))
        .slice(0, 10);

    sorted.forEach((p, index) => {
        const li = document.createElement('li');
        if (p.id === player?.id) {
            li.className = 'me';
        }
        li.innerHTML = `
            <span>${index + 1}. ${p.name || 'Unknown'}</span>
            <span>${Math.floor(p.length || 0)}</span>
        `;
        list.appendChild(li);
    });
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', initGame);

// ====================== MINIMAP ======================
function drawMinimap() {
    if (!minimapCtx || !player) return;

    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const scale = w / ARENA_SIZE;

    // Clear
    minimapCtx.fillStyle = 'rgba(10, 0, 31, 0.8)';
    minimapCtx.fillRect(0, 0, w, h);

    // Draw Border
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    minimapCtx.strokeRect(0, 0, w, h);

    // Draw Food (Limited for performance)
    const foodEntries = Object.values(currentFoods);
    const limit = PERF.minimapFoodLimit;
    for (let i = 0; i < Math.min(foodEntries.length, limit); i++) {
        const f = foodEntries[i];
        minimapCtx.fillStyle = f.color || '#ffff00';
        minimapCtx.fillRect(f.x * scale, f.y * scale, 2, 2);
    }

    // Draw Other Players
    Object.values(otherPlayers).forEach(p => {
        minimapCtx.fillStyle = p.color || '#00ffff';
        minimapCtx.beginPath();
        minimapCtx.arc(p.x * scale, p.y * scale, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    // Draw Bots
    Object.values(bots).forEach(b => {
        minimapCtx.fillStyle = b.color || '#ff00ff';
        minimapCtx.beginPath();
        minimapCtx.arc(b.head.x * scale, b.head.y * scale, 2, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    // Draw Player
    if (player.isAlive) {
        minimapCtx.fillStyle = '#fff';
        minimapCtx.beginPath();
        minimapCtx.arc(player.head.x * scale, player.head.y * scale, 4, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Viewport Rectangle
        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        minimapCtx.lineWidth = 1;
        const viewX = camera.x * scale;
        const viewY = camera.y * scale;
        const viewW = (canvas.width / camera.zoom) * scale;
        const viewH = (canvas.height / camera.zoom) * scale;
        minimapCtx.strokeRect(viewX, viewY, viewW, viewH);
    }
}
