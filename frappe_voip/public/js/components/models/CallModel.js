// Model to represent Call
// Ensure the 'voip' namespace exists
frappe.provide('voip');

// Define the Call class
voip.Call = class Call {
    constructor(data) {
        this.id = data.id;
        this.activity = data.activity;
        this.creationDate = data.creationDate ? moment(data.creationDate) : null;
        this.direction = data.direction || '';
        this.displayName = data.displayName || '';
        this.endDate = data.endDate ? moment(data.endDate) : null;
        this.partner = data.partner || null;
        this.phoneNumber = data.phoneNumber || '';
        this.startDate = data.startDate ? moment(data.startDate) : null;
        this.state = data.state || '';
        this.timer = data.timer || null;
    }

    static records = {};

    static insert(data) {
        let call = this.records[data.id];
        if (call) {
            call.update(data);
        } else {
            call = new voip.Call(data);
            this.records[data.id] = call;
        }
        if (data.partner) {
            call.partner = voip.Persona.insert({ ...data.partner, type: 'partner' });
        }
        return call;
    }

    update(data) {
        if (data.activity !== undefined) this.activity = data.activity;
        if (data.creationDate !== undefined) this.creationDate = moment(data.creationDate);
        if (data.direction !== undefined) this.direction = data.direction;
        if (data.displayName !== undefined) this.displayName = data.displayName;
        if (data.endDate !== undefined) this.endDate = moment(data.endDate);
        if (data.partner !== undefined) this.partner = data.partner;
        if (data.phoneNumber !== undefined) this.phoneNumber = data.phoneNumber;
        if (data.startDate !== undefined) this.startDate = moment(data.startDate);
        if (data.state !== undefined) this.state = data.state;
        if (data.timer !== undefined) this.timer = data.timer;
    }

    get callDate() {
        if (this.state === 'terminated' && this.startDate) {
            return this.startDate.format('L LT');
        }
        if (this.creationDate) {
            return this.creationDate.format('L LT');
        }
        return '';
    }

    get duration() {
        if (!this.startDate || !this.endDate) {
            return 0;
        }
        return this.endDate.diff(this.startDate, 'seconds');
    }

    get durationString() {
        const duration = this.duration;
        if (!duration) {
            return '';
        }
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        if (minutes === 0) {
            if (seconds === 1) return __('1 second');
            return __('%(seconds)s seconds', { seconds });
        }
        if (seconds === 0) {
            if (minutes === 1) return __('1 minute');
            return __('%(minutes)s minutes', { minutes });
        }
        return __('%(minutes)s min %(seconds)s sec', { minutes, seconds });
    }

    get isInProgress() {
        switch (this.state) {
            case 'calling':
            case 'ongoing':
                return Boolean(voip.userAgent && voip.userAgent.session);
            default:
                return false;
        }
    }
};
