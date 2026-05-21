// ====================== POWER-UP SYSTEM ======================
// Manages power-ups: shield, magnet, speed, ghost, bomb

const PowerUpSystem = {
    powerUps: {},

    spawnPowerUp(roomId) {
        const types = ["shield", "magnet", "speed", "ghost", "bomb"];
        const type = types[Math.floor(Math.random() * types.length)];

        const x = 300 + Math.random() * 2200;
        const y = 300 + Math.random() * 2200;
        const id = "pu_" + Math.random().toString(36).substring(2, 9);
        const color = this.getColor(type);

        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/powerups/${id}`).set({
                x, y, type, color
            });
        }
    },

    startSpawner(roomId) {
        setInterval(() => {
            if (Math.random() < 0.75) {
                this.spawnPowerUp(roomId);
            }
        }, 14000);
    },

    listenToPowerUps(roomId, onUpdate) {
        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/powerups`).on('value', (snapshot) => {
                this.powerUps = snapshot.val() || {};
                onUpdate(this.powerUps);
            });
        }
    },

    removePowerUp(roomId, puId) {
        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/powerups/${puId}`).remove();
        }
    },

    getColor(type) {
        switch(type) {
            case "shield": return "#00ffff";
            case "magnet": return "#ff00ff";
            case "speed":  return "#ffff00";
            case "ghost":  return "#ffffff";
            case "bomb":   return "#ff4400";
            default:       return "#00ff88";
        }
    },

    getIcon(type) {
        const icons = {
            shield: "🛡️",
            magnet: "🧲",
            speed:  "⚡",
            ghost:  "👻",
            bomb:   ""
        };
        return icons[type] || "⭐";
    }
};
