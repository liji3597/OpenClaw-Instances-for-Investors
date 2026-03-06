const ERROR_CODES = {
    OK: { zh: '操作成功', en: 'Operation successful' },
    INTERNAL_ERROR: { zh: '系统繁忙，请稍后重试', en: 'Internal error, please try again later' },
    MISSING_TELEGRAM_ID: { zh: '缺少用户标识 telegramId', en: 'Missing user identifier telegramId' },
    MISSING_REQUIRED_PARAMS: { zh: '缺少必填参数', en: 'Missing required parameters' },
    INVALID_STRATEGY_ID: { zh: '无效的策略 ID', en: 'Invalid strategy ID' },
    STRATEGY_NOT_FOUND: { zh: '策略不存在', en: 'Strategy not found' },
    STRATEGY_ALREADY_PAUSED: { zh: '策略已是暂停状态', en: 'Strategy is already paused' },
    STRATEGY_ALREADY_ACTIVE: { zh: '策略已是活跃状态', en: 'Strategy is already active' },
    STRATEGY_NOT_FOUND_OR_UNAUTHORIZED: { zh: '策略不存在或无权限操作', en: 'Strategy not found or unauthorized' },
    INVALID_ALERT_ID: { zh: '无效的警报 ID', en: 'Invalid alert ID' },
    INVALID_ALERT_CONDITION: { zh: '警报条件必须是 above 或 below', en: 'Alert condition must be above or below' },
    INVALID_ALERT_TYPE: { zh: '警报类型无效', en: 'Invalid alert type' },
    INVALID_ALERT_PERCENTAGE: { zh: '百分比参数无效', en: 'Invalid percentage value' },
    INVALID_TARGET_PRICE: { zh: '目标价格无效', en: 'Invalid target price' },
    COST_BASIS_NOT_FOUND: { zh: '未找到持仓成本数据，请先通过 DCA 或交易记录建立成本基准', en: 'Cost basis data not found. Build holdings history first.' },
    UNKNOWN_TOKEN: { zh: '未知代币符号', en: 'Unknown token symbol' },
    ALERT_NOT_FOUND: { zh: '警报不存在或无权限删除', en: 'Alert not found or unauthorized to delete' },
    ALERT_CREATED: { zh: '警报创建成功', en: 'Alert created successfully' },
    ALERT_DELETED: { zh: '警报删除成功', en: 'Alert deleted successfully' },
    ALERT_LIMIT_REACHED: { zh: '价格警报已达上限（最多 20 个）', en: 'Alert limit reached (maximum 20)' },
};

function formatError(code, lang = 'zh') {
    const locale = lang === 'en' ? 'en' : 'zh';
    const entry = ERROR_CODES[code];
    if (!entry) {
        return locale === 'en' ? `Unknown error code: ${code}` : `未知错误码: ${code}`;
    }
    return entry[locale];
}

module.exports = {
    ERROR_CODES,
    formatError,
};
