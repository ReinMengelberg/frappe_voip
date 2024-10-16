// Service to retrieve/update VoIP User Settings
frappe.provide('voip');

const VOIP_CONFIG_KEYS = [
    "external_device_number",
    "how_to_call_on_mobile",
    "should_auto_reject_incoming_calls",
    "should_call_from_another_device",
    "voip_secret",
    "voip_username",
];

voip.user_settings = voip.user_settings || {};

frappe.call({
    method: 'your_app.your_module.doctype.voip_user_settings.voip_user_settings.get_voip_user_settings',
    callback: function(r) {
        if (r.message) {
            VOIP_CONFIG_KEYS.forEach(function(key) {
                if (key in r.message) {
                    voip.user_settings[key] = r.message[key];
                }
            });
            // Now you can use voip.user_settings as needed
        }
    }
});
