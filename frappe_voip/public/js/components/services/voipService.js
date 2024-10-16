// Service to manage VoIP calls
// Ensure the 'voip' namespace exists
frappe.provide('voip');

// Import or define necessary utilities
// Assuming cleanPhoneNumber is defined in voip.utils
// frappe.require('voip.utils'); // If using a module system

// Define the Voip class
voip.Voip = class Voip {
    constructor() {
        // Initialize properties
        this.bus = new frappe.events.EventEmitter(); // Use Frappe's event system
        this.error = null;
        this.isReady = new frappe._Deferred();

        // Initialize services
        this.settings = voip.user_settings; // From your earlier code
        this.callService = voip.callService; // From previous code
        this.dialog = frappe; // Use Frappe's dialog methods
        this.softphone = new voip.Softphone(this);

        // Initialize other properties
        this.mode = 'prod'; // Or 'demo', depending on your configuration
        this.pbxAddress = voip.global_settings.pbx_address; // Fetch from global settings
        this.webSocketUrl = voip.global_settings.websocket_url; // Fetch from global settings

        // Initialize data stores
        this.calls = [];
        this.contacts = [];
        this.activities = [];

        // Fetch VoIP configuration and resolve isReady when done
        this.init();
    }

    init() {
        // Fetch VoIP configuration
        // Assuming you have voipConfig available in frappe.boot or fetch it via frappe.call
        const voipConfig = frappe.boot.voipConfig || {};

        this.callService.missedCalls = voipConfig.missedCalls || 0;

        // Assign other configuration properties
        Object.assign(this, voipConfig);

        // Listen to real-time events
        frappe.realtime.on('delete_call_activity', this._onDeleteCallActivity.bind(this));
        frappe.realtime.on('refresh_call_activities', this.fetchTodayCallActivities.bind(this));

        // Listen to beforeunload event
        window.addEventListener('beforeunload', this._onBeforeUnload.bind(this));

        // Resolve isReady
        this.isReady.resolve();
    }

    get areCredentialsSet() {
        return Boolean(this.settings.voip_username && this.settings.voip_secret);
    }

    get authorizationUsername() {
        return this.settings.voip_username || '';
    }

    get canCall() {
        return (
            this.mode === 'demo' ||
            (this.hasRtcSupport && this.isServerConfigured && this.areCredentialsSet)
        );
    }

    get hasRtcSupport() {
        return Boolean(
            window.RTCPeerConnection && window.MediaStream && navigator.mediaDevices
        );
    }

    get isServerConfigured() {
        return Boolean(this.pbxAddress && this.webSocketUrl);
    }

    get isValidTransferNumber() {
        if (!this.settings.external_device_number) {
            return false;
        }
        return voip.utils.cleanPhoneNumber(this.settings.external_device_number) !== '';
    }

    get missedCalls() {
        return this.callService.missedCalls;
    }

    get willCallFromAnotherDevice() {
        return this.settings.should_call_from_another_device && this.isValidTransferNumber;
    }

    async fetchContacts(searchTerms = '', offset = 0, limit = 13) {
        // Cancel previous request if any
        if (this._contactRpc) {
            this._contactRpc.abort = true;
        }
        const self = this;
        this._contactRpc = frappe.call({
            method: 'frappe_voip.api.get_contacts',
            args: {
                offset: offset,
                limit: limit,
                search_terms: searchTerms,
            },
            callback: function (r) {
                if (self._contactRpc.abort) {
                    // Ignore the result
                    return;
                }
                const contactsData = r.message;
                contactsData.forEach((contactData) => {
                    self.contacts.push({ ...contactData, type: 'partner' });
                });
                self._contactRpc = null;
            },
        });
    }

    async fetchRecentCalls(offset = 0, limit = 13) {
        // Cancel previous request if any
        if (this._recentCallsRpc) {
            this._recentCallsRpc.abort = true;
        }
        const self = this;
        this._recentCallsRpc = frappe.call({
            method: 'voip.call.get_recent_phone_calls',
            args: {
                offset: offset,
                limit: limit,
                search_terms: this.softphone.searchBarInputValue.trim(),
            },
            callback: function (r) {
                if (self._recentCallsRpc.abort) {
                    // Ignore the result
                    return;
                }
                const callsData = r.message;
                callsData.forEach((data) => {
                    self.calls.push(data);
                });
                self._recentCallsRpc = null;
            },
        });
    }

    async fetchTodayCallActivities() {
        if (this._activityRpc) {
            return;
        }
        const self = this;
        this._activityRpc = frappe.call({
            method: 'mail.activity.get_today_call_activities',
            callback: function (r) {
                const activitiesData = r.message;
                activitiesData.forEach((data) => {
                    self.activities.push(data);
                });
                self._activityRpc = null;
            },
        });
    }

    resetMissedCalls() {
        if (this.missedCalls !== 0) {
            frappe.call({
                method: 'frappe_voip.api.reset_last_seen_phone_call',
            });
        }
        this.callService.missedCalls = 0;
    }

    resolveError() {
        this.error = null;
    }

    triggerError(message, options = {}) {
        const isNonBlocking = options.isNonBlocking || false;
        const safeText = frappe.utils.xss_sanitise(message).replace(/\n/g, '<br>');
        this.error = { text: safeText, isNonBlocking };
    }

    async willCallUsingVoip() {
        function isMobileOS() {
            return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
        }
        if (!isMobileOS()) {
            return true;
        }
        const callMethod = this.settings.how_to_call_on_mobile;
        if (callMethod !== 'ask') {
            return callMethod === 'voip';
        }
        const useVoip = new frappe._Deferred();
        frappe.prompt(
            [
                {
                    fieldname: 'call_method',
                    label: __('How do you want to make the call?'),
                    fieldtype: 'Select',
                    options: ['VoIP', 'Phone'],
                    default: 'VoIP',
                    reqd: 1,
                },
            ],
            (values) => {
                if (values.call_method === 'VoIP') {
                    useVoip.resolve(true);
                } else {
                    useVoip.resolve(false);
                }
            },
            __('Call Method'),
            __('Call')
        );
        return useVoip.promise();
    }

    _onBeforeUnload(ev) {
        if (!this.softphone.selectedCorrespondence?.call?.isInProgress) {
            return;
        }
        ev.preventDefault();
        ev.returnValue = __('There is still a call in progress, are you sure you want to leave the page?');
        return ev.returnValue;
    }

    _onDeleteCallActivity(payload) {
        const activity = payload;
        // Remove activity from the activities array
        this.activities = this.activities.filter((act) => act.name !== activity.name);
        // Optionally, update the UI to reflect the deletion
    }

    // Other methods as needed...
};

// Initialize and attach the Voip service
frappe.ready(async function () {
    // Check if user has the necessary role
    const hasRole = frappe.user_roles.includes('Employee'); // Adjust the role name as needed
    if (!hasRole) {
        voip.canCall = false;
        voip.isReady = frappe._Deferred();
        return;
    }
    // Initialize Voip instance
    voip.instance = new voip.Voip();
});

// Define the Softphone class
voip.Softphone = class Softphone {
    constructor(voipInstance) {
        this.voip = voipInstance;
        // Initialize other properties
        this.searchBarInputValue = '';
        // Implement other functionalities as needed
    }

    // Define methods for Softphone
};

// Similarly, define other components or models as needed
// For example, voip.callService, voip.utils, etc.

// Ensure that your services are properly defined and available
