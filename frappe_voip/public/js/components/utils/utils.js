// Utilities to clean phone numbers
frappe.provide('voip.utils');

/**
 * Removes whitespaces, dashes, slashes, and periods from a phone number.
 *
 * @param {string} phoneNumber
 * @returns {string}
 */
voip.utils.cleanPhoneNumber = function(phoneNumber) {
    // U+00AD is the “soft hyphen” character
    return phoneNumber.replace(/[\s-/.\u00AD]/g, "");
};

/**
 * Checks if 'substring' is a substring of 'targetString' after normalization.
 *
 * @param {string} targetString
 * @param {string} substring
 * @returns {boolean}
 */
voip.utils.isSubstring = function(targetString, substring) {
    if (!targetString) {
        return false;
    }
    const normalize = function(str) {
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "");
    };
    return normalize(targetString).includes(normalize(substring));
};
