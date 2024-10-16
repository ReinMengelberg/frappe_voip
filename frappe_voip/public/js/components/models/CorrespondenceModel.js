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

    get avatarUrl() {
        if (this.partner) {
            if (this.partner.image) {
                return this.partner.image;
            } else {
                return "/assets/frappe/images/ui/avatar.png";
            }
        }
        return "/assets/frappe/images/ui/avatar.png";
    }

    get partner() {
        return this.call?.partner || this.activity?.partner || this._partner;
    }

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

    saveCallLog() {
        const callData = {
            phone_number: this.phoneNumber,
            direction: this.call.direction,
            partner: this.partner ? this.partner.name : null,
            start_time: this.call.startDate ? this.call.startDate.format() : null,
            end_time: this.call.endDate ? this.call.endDate.format() : null,
            status: this.call.state,
            // Add other fields as necessary
        };

        frappe.call({
            method: 'frappe_voip.voip_call.log_voip_call',
            args: {
                call_data: callData,
            },
            callback: function (r) {
                if (!r.exc) {
                    console.log('VoIP Call logged successfully with name:', r.message);
                } else {
                    console.error('Failed to log VoIP Call.', r.exc);
                }
            },
        });
    }
};
