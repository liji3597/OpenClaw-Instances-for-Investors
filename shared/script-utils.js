/**
 * shared/script-utils.js
 * Centralized parameter validation and UX utilities for OpenClaw scripts.
 */

const i18n = {
    en: {
        missing_params: (fields) => `I need more information to proceed: ${fields.join(', ')}.`,
        invalid_option: (field, options) => `Invalid ${field}. Expected one of: ${options.join(', ')}.`,
        invalid_number: (field) => `${field} must be a valid number.`,
        error_prefix: '❌ Error / 错误:',
    },
    zh: {
        missing_params: (fields) => `我需要更多信息才能继续：${fields.join('、')}。`,
        invalid_option: (field, options) => `${field} 无效。应为：${options.join('、')}。`,
        invalid_number: (field) => `${field} 必须是有效数字。`,
        error_prefix: '❌ 错误 / Error:',
    }
};

function parseArgs(argv) {
    const langArg = argv.find(a => a.startsWith('--lang='));
    const lang = langArg ? langArg.split('=')[1] : 'zh';
    const positional = argv.filter(a => !a.startsWith('--'));
    return { lang, positional };
}

function validate(positional, schema, lang = 'zh') {
    const t = i18n[lang] || i18n.zh;
    const missing = [];
    const errors = [];
    const params = { lang };

    for (const field of schema) {
        const value = positional[field.index];
        const label = lang === 'zh' ? field.labelZh : field.labelEn;

        if (value === undefined || value === null || value === '') {
            missing.push(label);
        } else {
            if (field.type === 'number' && isNaN(parseFloat(value))) {
                errors.push(t.invalid_number(label));
            } else if (field.options && !field.options.includes(value.toLowerCase())) {
                errors.push(t.invalid_option(label, field.options));
            } else {
                params[field.name] = field.type === 'number' ? parseFloat(value) :
                                     field.type === 'string' && field.uppercase ? value.toUpperCase() : value;
            }
        }
    }

    if (missing.length > 0 || errors.length > 0) {
        return {
            valid: false,
            code: missing.length > 0 ? 'MISSING_PARAMS' : 'INVALID_PARAMS',
            missing,
            message: errors.length > 0 ? errors.join(' ') : t.missing_params(missing)
        };
    }

    return { valid: true, params };
}

function handleResult(validation) {
    if (!validation.valid) {
        console.log(JSON.stringify(validation, null, 2));
        process.exit(0);
    }
}

module.exports = { parseArgs, validate, handleResult, i18n };
