'use strict';

const DEFAULT_ALLOWED_KYC_STATUSES = Object.freeze(['VERIFIED']);

const RULE_CODES = Object.freeze({
    GEO_BLOCKED: 'GEO_BLOCKED',
    KYC_REQUIRED: 'KYC_REQUIRED',
});

class InMemoryKycProvider {
    constructor(initialStatuses = {}) {
        this.statusByUserId = new Map();
        for (const [userId, status] of Object.entries(initialStatuses || {})) {
            this.statusByUserId.set(String(userId), String(status || '').toUpperCase());
        }
    }

    getStatus(userId) {
        return this.statusByUserId.get(String(userId)) || null;
    }

    setStatus(userId, status) {
        this.statusByUserId.set(String(userId), String(status || '').toUpperCase());
    }
}

class InMemoryGeoProvider {
    constructor(initialCountries = {}) {
        this.countryByUserId = new Map();
        for (const [userId, countryCode] of Object.entries(initialCountries || {})) {
            this.countryByUserId.set(String(userId), normalizeCountry(countryCode));
        }
    }

    getCountryCode(userId) {
        return this.countryByUserId.get(String(userId)) || null;
    }

    setCountryCode(userId, countryCode) {
        this.countryByUserId.set(String(userId), normalizeCountry(countryCode));
    }
}

class ComplianceService {
    constructor(options = {}) {
        this.kycRequired = options.kycRequired !== false;
        this.allowedKycStatuses = new Set(
            (options.allowedKycStatuses || DEFAULT_ALLOWED_KYC_STATUSES)
                .map((value) => String(value || '').toUpperCase())
                .filter(Boolean)
        );
        this.blockedJurisdictions = new Set(
            (options.blockedJurisdictions || [])
                .map((value) => normalizeCountry(value))
                .filter(Boolean)
        );
        this.kycProvider = options.kycProvider || new InMemoryKycProvider();
        this.geoProvider = options.geoProvider || new InMemoryGeoProvider();
        this.allowUntrustedInputOverrides = options.allowUntrustedInputOverrides === true;
    }

    evaluate(input = {}) {
        const userId = String(input.userId || '').trim();
        if (!userId) {
            const err = new Error('userId is required.');
            err.code = 'MISSING_USER_ID';
            throw err;
        }

        const trustedContext = input.trustedContext === true || this.allowUntrustedInputOverrides;
        const providerCountry = this.geoProvider && typeof this.geoProvider.getCountryCode === 'function'
            ? this.geoProvider.getCountryCode(userId)
            : null;
        const providerKyc = this.kycProvider && typeof this.kycProvider.getStatus === 'function'
            ? this.kycProvider.getStatus(userId)
            : null;

        const overrideCountry = trustedContext
            ? (input.countryCode || input.metadata?.countryCode)
            : null;
        const overrideKyc = trustedContext
            ? (input.kycStatus || input.metadata?.kycStatus)
            : null;

        const countryCode = normalizeCountry(
            providerCountry || overrideCountry
        );

        const kycStatus = String(
            providerKyc || overrideKyc || ''
        ).toUpperCase() || null;

        const violations = [];

        if (countryCode && this.blockedJurisdictions.has(countryCode)) {
            violations.push({
                ruleCode: RULE_CODES.GEO_BLOCKED,
                message: `Execution blocked in jurisdiction: ${countryCode}`,
                severity: 'HIGH',
                metadata: {
                    countryCode,
                    blockedJurisdictions: [...this.blockedJurisdictions],
                },
            });
        }

        if (this.kycRequired && !this.allowedKycStatuses.has(String(kycStatus || '').toUpperCase())) {
            violations.push({
                ruleCode: RULE_CODES.KYC_REQUIRED,
                message: `KYC status not allowed: ${kycStatus || 'UNKNOWN'}`,
                severity: 'HIGH',
                metadata: {
                    kycRequired: this.kycRequired,
                    kycStatus: kycStatus || 'UNKNOWN',
                    allowedStatuses: [...this.allowedKycStatuses],
                },
            });
        }

        return {
            allowed: violations.length === 0,
            userId,
            countryCode,
            kycStatus,
            violations,
        };
    }

    assertAllowed(input = {}) {
        const result = this.evaluate(input);
        if (result.allowed) return result;

        const err = new Error('Compliance policy blocked order.');
        err.code = 'COMPLIANCE_BLOCKED';
        err.violations = result.violations;
        throw err;
    }

    setBlockedJurisdictions(countryCodes = []) {
        this.blockedJurisdictions = new Set(
            (countryCodes || []).map((value) => normalizeCountry(value)).filter(Boolean)
        );
        return [...this.blockedJurisdictions];
    }

    addBlockedJurisdiction(countryCode) {
        const normalized = normalizeCountry(countryCode);
        if (!normalized) return [...this.blockedJurisdictions];
        this.blockedJurisdictions.add(normalized);
        return [...this.blockedJurisdictions];
    }

    removeBlockedJurisdiction(countryCode) {
        const normalized = normalizeCountry(countryCode);
        if (!normalized) return [...this.blockedJurisdictions];
        this.blockedJurisdictions.delete(normalized);
        return [...this.blockedJurisdictions];
    }

    setAllowedKycStatuses(statuses = []) {
        this.allowedKycStatuses = new Set(
            (statuses || []).map((value) => String(value || '').toUpperCase()).filter(Boolean)
        );
        return [...this.allowedKycStatuses];
    }
}

function normalizeCountry(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).trim().toUpperCase();
}

module.exports = ComplianceService;
module.exports.RULE_CODES = RULE_CODES;
module.exports.DEFAULT_ALLOWED_KYC_STATUSES = DEFAULT_ALLOWED_KYC_STATUSES;
module.exports.InMemoryKycProvider = InMemoryKycProvider;
module.exports.InMemoryGeoProvider = InMemoryGeoProvider;
