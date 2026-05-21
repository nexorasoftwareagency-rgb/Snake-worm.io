// ====================== COLLISION SYSTEM ======================
// Handles collision detection: head vs body, head vs food, head vs power-ups

const Collision = {

    checkWormCollision(head, segments, skipFirst = 8) {
        const headRadius = 14;
        const bodyRadius = 11;

        for (let i = skipFirst; i < segments.length; i++) {
            const seg = segments[i];
            const dx = head.x - seg.x;
            const dy = head.y - seg.y;
            const dist = Math.hypot(dx, dy);

            if (dist < headRadius + bodyRadius) {
                return true;
            }
        }
        return false;
    },

    checkAgainstOtherWorm(myHead, otherSegments) {
        const headR = 14;
        const bodyR = 11;

        for (let seg of otherSegments) {
            const dx = myHead.x - seg.x;
            const dy = myHead.y - seg.y;
            if (Math.hypot(dx, dy) < headR + bodyR) {
                return true;
            }
        }
        return false;
    },

    checkAllCollisions(player, otherPlayers, bots) {
        const myHead = player.head;
        const mySegments = player.segments;

        // Self Collision
        if (Collision.checkWormCollision(myHead, mySegments, 12)) {
            return { collided: true, type: "self" };
        }

        // Check against other real players
        for (let id in otherPlayers) {
            const remote = otherPlayers[id];
            if (!remote.segments || remote.segments.length < 5) continue;

            if (Collision.checkAgainstOtherWorm(myHead, remote.segments)) {
                return { collided: true, type: "player", killerId: id };
            }
        }

        // Check against bots
        for (let id in bots) {
            const bot = bots[id];
            if (!bot.segments || bot.segments.length < 5) continue;

            if (Collision.checkAgainstOtherWorm(myHead, bot.segments)) {
                return { collided: true, type: "bot", killerId: id };
            }
        }

        return { collided: false };
    }
};
