const ui = {
    update() {
        this.syncResources();
        this.animateCore();
    },

    syncResources() {
        const p = document.getElementById('val-praise');
        const o = document.getElementById('val-offerings');
        const u = document.getElementById('val-uptime');

        if (p) {
            p.innerText = Math.floor(State.resources.praise).toLocaleString();
        }
        if (o) {
            o.innerText = Math.floor(State.resources.offerings).toLocaleString();
        }
        if (u) {
            u.innerText = Math.floor((Date.now() - State.startTime) / 1000) + "s";
        }
    },

    initCoreCanvas() {
        const canvas = document.getElementById('core-canvas');
        if (!canvas) {
            console.warn("Core canvas not found during init.");
            return;
        }
        this.ctx = canvas.getContext('2d');
        this.pulse = 0;
        console.log("Core canvas initialized successfully.");
    },

    animateCore() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.pulse += 0.05 + (State.pps * 0.01);
        const radius = 60 + Math.sin(this.pulse) * 15;

        // Draw Divine Pulse
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius - 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.fill();

        // Add orbiting particles
        for (let i = 0; i < 5; i++) {
            const angle = this.pulse * 0.5 + (i * Math.PI * 2 / 5);
            const dist = radius + 30 + Math.sin(this.pulse * 0.3) * 10;
            const x = canvas.width / 2 + Math.cos(angle) * dist;
            const y = canvas.height / 2 + Math.sin(angle) * dist;

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#4a90e2';
            ctx.fill();

            // Trail
            ctx.beginPath();
            ctx.moveTo(x, y);
            const trailX = canvas.width / 2 + Math.cos(angle - 0.2) * dist;
            const trailY = canvas.height / 2 + Math.sin(angle - 0.2) * dist;
            ctx.lineTo(trailX, trailY);
            ctx.strokeStyle = 'rgba(74, 144, 226, 0.3)';
            ctx.stroke();
        }
    },

    log(msg) {
        const log = document.getElementById('engine-log');
        if (log) {
            const entry = document.createElement('div');
            entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.prepend(entry);
            // Limit log entries
            if (log.children.length > 5) log.lastChild.remove();
        }
    }
};

// Add styles for win-btn and other UI components back to style.css in the next step
