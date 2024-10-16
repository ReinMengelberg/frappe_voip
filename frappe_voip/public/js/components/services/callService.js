// Service to manage the Calls
frappe.provide('voip');

// Define the CallService class
voip.CallService = class CallService {
    constructor() {
        this.missedCalls = 0;
        // Initialize any additional services or variables here
    }

    async abort(call) {
        const response = await frappe.call({
            method: "voip.call.abort_call",
            args: { call_id: call.id },
        });
        const data = response.message;
        // Handle the data as needed
        // For example, update the call in local storage or UI
    }

    async create(data) {
        const { activity, partner } = data;
        data.partner_id = partner?.id;
        delete data.activity;
        delete data.partner;

        const response = await frappe.call({
            method: "voip.call.create_and_format",
            args: data,
        });
        const res = response.message;

        // Handle the created call data
        const call = res; // Adjust according to your data structure
        if (activity) {
            call.activity = activity;
        }
        if (!call.partner) {
            frappe.call({
                method: "voip.call.get_contact_info",
                args: { call_id: call.id },
            }).then((response) => {
                const partnerData = response.message;
                if (partnerData) {
                    call.partner = partnerData;
                }
            });
        }
        return call;
    }

    async end(call, options = {}) {
        const { activityDone = true } = options;
        let data;

        if (call.activity && activityDone) {
            const response = await frappe.call({
                method: "voip.call.end_call",
                args: {
                    call_id: call.id,
                    activity_name: call.activity.res_name,
                },
            });
            data = response.message;
            await this.markActivityAsDone(call.activity);
            this.deleteActivity(call.activity);
            call.activity = null;
        } else {
            const response = await frappe.call({
                method: "voip.call.end_call",
                args: { call_id: call.id },
            });
            data = response.message;
        }
        // Handle the data as needed

        if (call.timer) {
            clearInterval(call.timer.interval);
            call.timer = null;
        }
    }

    async miss(call) {
        const response = await frappe.call({
            method: "voip.call.miss_call",
            args: { call_id: call.id },
        });
        const data = response.message;
        // Handle the data as needed
        this.missedCalls++;
    }

    async reject(call) {
        const response = await frappe.call({
            method: "voip.call.reject_call",
            args: { call_id: call.id },
        });
        const data = response.message;
        // Handle the data as needed
    }

    async start(call) {
        const response = await frappe.call({
            method: "voip.call.start_call",
            args: { call_id: call.id },
        });
        const data = response.message;
        // Handle the data as needed

        call.timer = {};
        const computeDuration = () => {
            call.timer.time = Math.floor((Date.now() - call.startDate) / 1000);
        };
        computeDuration();
        call.timer.interval = setInterval(computeDuration, 1000);
    }

    // Helper methods for activity management
    async markActivityAsDone(activity) {
        // Implement according to your app's logic
        await frappe.call({
            method: "frappe.desk.form.save.savedocs",
            args: {
                doc: {
                    doctype: activity.doctype,
                    name: activity.name,
                    status: "Closed",
                },
            },
        });
    }

    deleteActivity(activity) {
        // Implement according to your app's logic
        frappe.call({
            method: "frappe.client.delete",
            args: {
                doctype: activity.doctype,
                name: activity.name,
            },
        });
    }
};

// Initialize and attach the service to the 'voip' namespace
voip.callService = new voip.CallService();