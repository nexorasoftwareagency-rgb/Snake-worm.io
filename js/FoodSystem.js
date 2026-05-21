// ====================== FOOD SYSTEM ======================
// Manages food spawning, eating, and Firebase synchronization

const foodSystem = {
    foods: {},

    generateInitialFood(roomId, count = 180) {
        const batch = {};
        for (let i = 0; i < count; i++) {
            const id = "food_" + Math.random().toString(36).substring(2, 9);
            const x = 200 + Math.random() * 2400;
            const y = 200 + Math.random() * 2400;
            const value = 5 + Math.random() * 7;
            const color = this.getRandomColor();
            
            batch[id] = { x, y, value, color };
        }
        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/food`).set(batch);
        }
    },

    startFoodSpawner(roomId) {
        setInterval(() => {
            this.spawnSingleFood(roomId);
        }, 280);
    },

    spawnSingleFood(roomId) {
        const id = "food_" + Math.random().toString(36).substring(2, 9);
        const x = 100 + Math.random() * 2600;
        const y = 100 + Math.random() * 2600;
        const value = 5 + Math.random() * 6;
        const color = this.getRandomColor();

        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/food/${id}`).set({
                x, y, value, color
            });
        }
    },

    removeFood(roomId, foodId) {
        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/food/${foodId}`).remove();
        }
    },

    listenToFood(roomId, onFoodUpdate) {
        if (typeof firebase !== 'undefined') {
            firebase.database().ref(`rooms/${roomId}/food`).on('value', (snapshot) => {
                this.foods = snapshot.val() || {};
                onFoodUpdate(this.foods);
            });
        }
    },

    getRandomColor() {
        const colors = ["#ffff00", "#00ffcc", "#ff00ff", "#88ff00", "#ff8800"];
        return colors[Math.floor(Math.random() * colors.length)];
    }
};
