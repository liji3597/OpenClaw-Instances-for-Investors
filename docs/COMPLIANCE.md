# Compliance Framework / 合规框架 (P5 Beta)

## 1. Jurisdictional Restrictions / 地域限制
To align with HK SFC and SG MAS guidelines, the following jurisdictions are strictly prohibited from using live execution features:
根据香港证监会(SFC)和新加坡金管局(MAS)指引，严禁以下地区用户使用实盘交易功能：
- **Prohibited List:** United States (US), Mainland China (CN), North Korea, Iran.
- **Enforcement:** Frontend IP-based Geo-fencing and Wallet-origin analysis.

## 2. KYC/AML Requirements / 反洗钱要求
Beta participants must complete a basic identification process:
Beta 测试参与者必须完成基础身份验证：
- **Tier 1 (Beta):** Telegram ID verification + Connected Wallet History check (No Tornado Cash interaction).
- **AML Screening:** Real-time wallet screening via Helius/Chainalysis integration for P5.

## 3. Regulatory Licensing / 牌照评估
- **Exemption Status:** Currently operating under a "Software Provider" non-custodial exemption (Singapore SFA/PSA).
- **VASP Compliance:** If revenue sharing is enabled (P7), a Virtual Asset Service Provider license must be sought in HK/SG.

## 4. Data Privacy / 数据隐私
- **GDPR/CCPA:** All user data (wallets/logs) are stored encrypted. Users can request data deletion via `/delete_data` command.

---
*Last Updated: 2026-03-09*
