const url = require("url");
const axios = require("axios");

/**
 * @typedef {Object[]} validFpr
 * @property {String} product ID of the product
 * @property {String|null} productDescription Description of the licensed product
 * @property {Object[]} features Features of the product that are licensed
 * @property {String} features[].feature ID of the licensed feature
 * @property {String} features[].featureDescription Description of the licensed feature
 */

class ExaLicense {
    /**
     * Instantiate a new connection to an ExaLicense server
     * @constructor
     * @param {String} licensingEndpoint Path of the licensing endpoint of the server
     * @param {String|null} opt.licenseKey License key to use for this product. Can be set later if unknown
     * @param {Number|null} opt.leaseExpiry Duration a lease should last before it expires
     * @param {String|null} opt.signingKey The public key the signing server uses to sign leases. If specified, offline validation of leases will be enabled
     * @param {String|null} opt.clientId Client identifier of this instance
     * @param {Boolean|null} opt.allowOfflineCheck Allow a check to succeed for a lease only by offline signature validation (requires opt.signingKey) - useful if there is not always a network connection
     * @param {Number|null} opt.renewTimeout Renew lease on check if there is less time than specified left (unit: seconds)
     */
    constructor(
        licensingEndpoint,
        {
            licenseKey = null,
            leaseExpiry = 3600,
            signingKey = null,
            clientId = null,
            allowOfflineCheck = false,
            renewTimeout = 1800,
        } = {}
    ) {
        this.endpoint = url.parse(licensingEndpoint.replace(/\/+$/, ""));
        this.defaultLeaseExpiry = leaseExpiry;
        this.pubKey = signingKey;
        this.clientId = clientId;
        this.renewTimeout = renewTimeout;
        this.allowOfflineCheck = allowOfflineCheck;
        if (licenseKey) this.setLicenseKey(licenseKey);
    }

    /**
     * Check whether axios has thrown the error because of a 40x status
     * @param {object} err Error object
     */
    _checkFor40xInError(err) {
        const status = (err.response || {}).status;
        if (status >= 400 && status <= 409) return true;
        return false;
    }

    /**
     * Set the license key to use
     * @param {String} licenseKey License key to use for all operations
     */
    setLicenseKey(licenseKey) {
        this.licenseKey = licenseKey;
    }

    /**
     * Check whether the license key is valid
     * @returns {Object} info Information about the key
     * @returns {Boolean} info.isValid Indicates whether the key is valid
     * @returns {Date|null} info.expiry Expiry data of the key,
     * @returns {Number|null} info.leaseLimit Maxmimum number of leases this license supports
     * @returns {Number|null} info.leasesUse Number of leases for this key that are currently in use
     * @returns {validFor} info.validFor Products/ features this key is valid for
     */
    async validateKey() {
        let res = {};
        try {
            res = (
                await axios.get(this.endpoint.href + "/key/validate", {
                    params: { key: this.licenseKey },
                })
            ).data;
        } catch (err) {
            if (this._checkFor40xInError(err)) return { isValid: false };
            throw err;
        }
        return res;
    }

    /**
     * Generate a new lease to use this product.
     * @param {Number|null} expiry Validity of the requested lease in seconds
     * @returns {Object} info Info about the obtained lease
     * @returns {Boolean} info.success Lease generation success indicator
     * @returns {String|null} info.errorCode Error code
     * @returns {String|null} info.lease Lease key that has been generated
     * @returns {Date|null} info.expiry Expiry timestamp of the lease
     * @returns {validFor|null} info.validFor Features/ Product the lease is valid for
     */
    async obtainLease(expiry = null) {
        expiry = expiry || this.defaultLeaseExpiry;

        let res = {};
        try {
            res = (
                await axios.post(this.endpoint.href + "/lease/obtain", {
                    key: this.licenseKey,
                    expiry,
                    clientId: this.clientId,
                })
            ).data;
        } catch (err) {
            if (this._checkFor40xInError(err))
                return {
                    success: false,
                    errorCode: ((err.response || {}).data || {}).errorCode,
                };
            throw err;
        }

        if (res.success && res.lease) {
            this.currentLease = res.lease;
        }

        return res;
    }

    /**
     * Validate the currently stored lease
     * @returns {Object} info Validation result
     * @returns {Boolean} info.isValid Indicates whether the lease is currently valid
     * @returns {String|null} info.errorCode Result for the lease being invalid
     * @return {Date|null} info.expiry Expiry time for the lease
     * @return {validFor|null} info.validFor Information about licensed features/ products
     */
    async validateLease() {
        let res = {};
        try {
            res = (
                await axios.get(this.endpoint.href + "/lease/validate", {
                    params: {
                        lease: this.currentLease,
                    },
                })
            ).data;
        } catch (err) {
            if (this._checkFor40xInError(err))
                return {
                    isValid: false,
                    errorCode: ((err.response || {}).data || {}).errorCode,
                };
            throw err;
        }

        return res;
    }

    /**
     * Validate the currently stored lease without contacting the server using it's signature
     * Caution: This requires the dependency "jsonwebtoken" to be present in your project.
     * When using this function, you must install it yourself, e.g. "npm i jsonwebtoken"
     * @returns {Object} info Validation result
     * @returns {Boolean} info.isValid Indicates whether the lease is currently valid
     * @returns {String|null} info.errorCode Result for the lease being invalid
     * @return {Date|null} info.expiry Expiry time for the lease
     * @return {validFor|null} info.validFor Information about licensed features/ products
     */
    validateLeaseOffline() {
        let lease = {};
        try {
            lease = require("jsonwebtoken").verify(this.currentLease, this.pubKey, {
                algorithms: ["RS256"],
            });
        } catch (err) {
            return { isValid: false, errorCode: "INVALID_LEASE" };
        }

        return {
            isValid: true,
            expiry: new Date(lease.exp * 1000),
            validFor: lease.validFor,
        };
    }

    /**
     * Renew the lease that is currently active. Only works if the
     * current lease is still valid. The current lease will become invalid
     * @param {Number|null} expiry Validity of the requested lease in seconds
     * @returns {Object} info Information about the result of the procedure
     * @returns {Boolean} info.success Indicates whether the operation was successful
     * @returns {String|null} info.error Error code if operation was not successful
     * @returns {Date|null} info.expiry Expiry timestamp of the new lease
     * @returns {String|null} info.lease New lease code
     */
    async renewLease(expiry = null) {
        expiry = expiry || this.defaultLeaseExpiry;

        let res = {};
        try {
            res = (
                await axios.post(this.endpoint.href + "/lease/renew", {
                    lease: this.currentLease,
                    expiry,
                })
            ).data;
        } catch (err) {
            if (this._checkFor40xInError(err))
                return {
                    success: false,
                    errorCode: ((err.response || {}).data || {}).errorCode,
                };
            throw err;
        }

        if (res.success && res.lease) {
            this.currentLease = res.lease;
        }

        return res;
    }

    /**
     * Release the lease that is currently in use
     * This operation allows other instances/ users
     * to use the key from the pool
     * @returns {Object} info Operation result information
     * @returns {Boolean} info.success Indicates whether the lease was release successfully
     * @returns {String|null} info.errorCode Error code if operation was not successful
     */
    async releaseLease() {
        let res = {};
        try {
            res = (
                await axios.post(this.endpoint.href + "/lease/release", {
                    lease: this.currentLease,
                })
            ).data;
        } catch (err) {
            if (this._checkFor40xInError(err))
                return {
                    success: false,
                    errorCode: ((err.response || {}).data || {}).errorCode,
                };
            throw err;
        }

        this.currentLease = null;

        return res;
    }

    /**
     * Check, whether the current product can be licensed with the given options
     * - Check if there is a current lease
     * - Validate current lease
     * - (Validate current lease offline if no connection can be made)
     * - Renew lease if necessary
     * - Obtain a new lease if there is no current lease
     * @returns {Object} info Return data of the check
     * @returns {Boolean} info.success Indicator whether the product could be licensed successfully
     * @returns {String|null} info.errorCode Code for the reason licensing didn't succeed
     * @return {validFor|null} info.ValidFor Products/ features the license is valid for
     */
    async check() {
        let lease;

        lease = await this.validateLease();
        if (!lease.isValid && !lease.errorCode && this.allowOfflineCheck) {
            //lease is not valid, but no error code has been specified
            //that probably means no server connection could be made
            lease = await this.validateLeaseOffline();
        }

        //try to obtain a new lease if necessary
        if (!lease.isValid) {
            lease = await this.obtainLease();
            if (!lease.success)
                return { success: false, errorCode: lease.errorCode };
        }

        //renew the lease if necessary
        if (
            new Date(lease.expiry).getTime() <
            new Date().getTime() + this.renewTimeout * 1000
        ) {
            lease = await this.renewLease();
            if (!lease.success)
                return { success: false, errorCode: lease.errorCode };
            lease = await this.validateLease();
            if (!lease.isValid)
                return { success: false, errorCode: lease.errorCode };
        }

        return {
            success: true,
            validFor: lease.validFor,
        };
    }
}

module.exports = ExaLicense;
