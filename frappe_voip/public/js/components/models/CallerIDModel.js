// Model to connect Caller to Contact
// Ensure the 'voip' namespace exists
frappe.provide('voip');

// Define the Correspondence class
voip.Correspondence = class Correspondence {
    constructor({ activity, partner, call }) {
        if (!activity && !partner && !call) {
            throw new TypeError(
                "Cannot create correspondence: missing required data. A correspondence must refer to an activity, a partner, or a phone call."
            );
        }
        this.activity = activity;
        this._partner = partner;
        this.call = call;

        // If a call is provided, save it to the VoIP Call DocType
        if (this.call) {
            this.saveCallLog();
        }
    }

    /** @returns {string} */
    get avatarUrl() {
        if (this.partner) {
            // Use the partner's image if available, else use a default avatar
            if (this.partner.image) {
                return this.partner.image;
            } else {
                return "/assets/frappe/images/ui/avatar.png";
            }
        }
        return "/assets/frappe/images/ui/avatar.png";
    }

    /** @returns {Object | undefined} */
    get partner() {
        return this.call?.partner || this.activity?.partner || this._partner;
    }

    /** @returns {string} */
    get phoneNumber() {
        if (this.call) {
            return this.call.phoneNumber;
        }
        if (this.activity) {
            return this.activity.mobile_no || this.activity.phone;
        }
        if (this.partner) {
            return this.partner.mobile_no || this.partner.phone;
        }
        return "";
    }

    // Method to save the call to the VoIP Call DocType
    saveCallLog() {
        const callData = {
            doctype: 'VoIP Call',
            phone_number: this.phoneNumber,
            direction: this.call.direction,
            partner: this.partner ? this.partner.name : null,
            start_time: this.call.startDate ? this.call.startDate.format() : null,
            end_time: this.call.endDate ? this.call.endDate.format() : null,
            status: this.call.state,
            // Add other fields as necessary
        };

        // Use frappe.call to create a new VoIP Call record
        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: callData,
            },
            callback: function (r) {
                if (!r.exc) {
                    console.log('VoIP Call logged successfully.');
                } else {
                    console.error('Failed to log VoIP Call.', r.exc);
                }
            },
        });
    }
};