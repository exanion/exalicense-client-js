const ExaLicense = require("./index");

const pubkey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuh17z5pWmPr9zskqEsRj
l17tJTyXfMXhLvhPcc9HkVNLoU6WuIvouqOLVrX0vMRboMrvGlaK6AB3b9dwTFr7
Z8cr3oQg7DsAz9WtPw8xefbEQpyegp56UQDBBVUcvkHVVjYrSSzK/V6puVXOU59g
nYYzzens4xzzvNQemxB0OZnL+R5hiN20wjbJHghlY0dkwLJMzv3C1nhwHq+ksrno
7rUurxG6NsfHUUBb8WmIFxluj4jG4DM8gGI/4cj09aleJ9CcW2owDVHBKQOXmbIM
NBxyDtL71+5XllJ+1z1tsO2945zMKkiMdeZd87C0uMZJYL92FI7SospHWnSgimIG
/wIDAQAB
-----END PUBLIC KEY-----`;

const lic = new ExaLicense("http://localhost:3040/licensing/56cb91bdc3464f14678934ca", {licenseKey: "lic2_alt", signingKey: pubkey, leaseExpiry: 300});



(async () => {
    console.log("Validate Key: ", await lic.validateKey());
    console.log("Obtain Lease: ", await lic.obtainLease());
    console.log("Validate Lease: ", await lic.validateLease());
    console.log("Validate Lease offline: ", lic.validateLeaseOffline());
    console.log("Renew Lease: ", await lic.renewLease());
    console.log("Validate Key: ", await lic.validateKey());
    console.log("Check: ", await lic.check());
    console.log("Release Lease: ", await lic.releaseLease());
})();