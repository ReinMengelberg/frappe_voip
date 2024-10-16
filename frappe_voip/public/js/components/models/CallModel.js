// Model to represent Call
frappe.provide('voip');

voip.Call = class Call {
    constructor(data) {
        // Initialize properties with default values or from data
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

    // Static properties
    static records = {};

    // Static methods
    /**
     * Inserts or updates a Call record.
     * @param {Object} data - The data for the Call.
     * @returns {voip.Call} - The inserted or updated Call instance.
     */
    static insert(data) {
        // Check if a call with the same ID already exists
        let call = this.records[data.id];
        if (call) {
            // Update existing call
            call.update(data);
        } else {
            // Create new call
            call = new voip.Call(data);
            this.records[data.id] = call;
        }
        // Handle partner data
        if (data.partner) {
            // Assuming voip.Persona is defined and has an insert method
            call.partner = voip.Persona.insert({ ...data.partner, type: 'partner' });
        }
        return call;
    }

    /**
     * Updates the Call instance with new data.
     * @param {Object} data - The data to update.
     */
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

    // Instance methods

    /** @returns {string} */
    get callDate() {
        if (this.state === 'terminated' && this.startDate) {
            return this.startDate.format('L LT'); // Localized date and time
        }
        if (this.creationDate) {
            return this.creationDate.format('L LT');
        }
        return '';
    }

    /** @returns {number} */
    get duration() {
        if (!this.startDate || !this.endDate) {
            return 0;
        }
        return this.endDate.diff(this.startDate, 'seconds');
    }

    /** @returns {string} */
    get durationString() {
        const duration = this.duration;
        if (!duration) {
            return '';
        }
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        if (minutes === 0) {
            switch (seconds) {
                case 0:
                    return __('less than a second');
                case 1:
                    return __('1 second');
                case 2:
                    return __('2 seconds');
                default:
                    return __('%(seconds)s seconds', { seconds });
            }
        }
        if (seconds === 0) {
            switch (minutes) {
                case 1:
                    return __('1 minute');
                case 2:
                    return __('2 minutes');
                default:
                    return __('%(minutes)s minutes', { minutes });
            }
        }
        return __('%(minutes)s min %(seconds)s sec', { minutes, seconds });
    }

    /** @returns {boolean} */
    get isInProgress() {
        switch (this.state) {
            case 'calling':
            case 'ongoing':
                // Check if the session exists
                return Boolean(voip.userAgent && voip.userAgent.session);
            default:
                return false;
        }
    }
};

// Now, ensure that voip.Persona is defined
// For demonstration purposes, here's a basic implementation:

voip.Persona = class Persona {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = data.type;
        // ... other properties
    }

    static records = {};

    static insert(data) {
        let persona = this.records[data.id];
        if (persona) {
            Object.assign(persona, data);
        } else {
            persona = new voip.Persona(data);
            this.records[data.id] = persona;
        }
        return persona;
    }
};

// Ensure moment.js is available (Frappe includes moment.js)
// Ensure that the translation function __ is available (Frappe provides __)

// Usage example:

// Insert a new call
const callData = {
    id: 1,
    direction: 'incoming',
    displayName: 'John Doe',
    phoneNumber: '+1234567890',
    state: 'ongoing',
    creationDate: '2023-10-15T12:34:56Z',
    partner: {
        id: 10,
        name: 'John Doe',
    },
};

voip.Call.insert(callData);

// Access a call
const call = voip.Call.records[1];
console.log(call.displayName); // Output: John Doe
console.log(call.callDate);    // Output: localized date and time
