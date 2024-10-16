// Service to manage the Ringtones
frappe.provide('voip');

voip.ringtoneService = {
    start() {
        const audio = new window.Audio();
        const ringtones = {
            dial: {
                source: "/frappe_voip/public/audio/dialtone.mp3",
                volume: 0.7,
            },
            incoming: {
                source: "/frappe_voip/public/audio/ringtone_incoming.mp3",
            },
            ringback: {
                source: "frappe_voip/public/audio/ringtone_outgoing.mp3",
            },
        };
        function play() {
            audio.currentTime = 0;
            audio.loop = true;
            audio.src = this.source;
            audio.volume = this.volume ?? 1;
            Promise.resolve(audio.play()).catch(() => {});
        }
        Object.values(ringtones).forEach((x) => Object.assign(x, { play }));
        return {
            ...ringtones,
            stopPlaying() {
                audio.pause();
                audio.currentTime = 0;
            },
        };
    },
};
