const game = {
    loop() {
        // Calculate gains
        const praiseGain = State.pps / 60;
        const offeringGain = State.mps / 60;

        State.resources.praise += praiseGain;
        State.resources.offerings += offeringGain;

        ui.update();
        requestAnimationFrame(() => this.loop());
    },

    manualPraise() {
        State.resources.praise += 1;
        ui.log("Miracle performed: Praise increased.");
    },

    buyAutomator(type) {
        if (type === 'seraph') {
            if (State.resources.praise >= 10) {
                State.resources.praise -= 10;
                State.pps += 1;
                ui.log("Seraph assigned. Praise influx stabilized.");
            } else {
                ui.log("Insufficient Praise for Seraph assignment.");
            }
        }
    }
};

// Start the game loop
game.loop();
