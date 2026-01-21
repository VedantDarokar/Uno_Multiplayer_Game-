
class SoundManager {
    constructor() {
        this.sounds = {
            draw: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'), // Paper slide/draw
            play: new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'), // Card place
            uno: new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3'), // Notification/Alert
            win: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'), // Success/Win
            shuffle: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3') // Shuffling
        };

        // Preload
        Object.values(this.sounds).forEach(s => {
            s.load();
            s.volume = 0.5;
        });
    }

    play(soundName) {
        try {
            const sound = this.sounds[soundName];
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(e => console.warn("Audio play failed (interaction required):", e));
            }
        } catch (e) {
            console.error("Sound error:", e);
        }
    }
}

export const soundManager = new SoundManager();
