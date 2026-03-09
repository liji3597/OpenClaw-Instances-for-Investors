# Incident Response Plan (IRP) / 事故响应预案

## 1. Incident Classification / 事故分级
- **P0 (Critical):** Fund loss detected, private key compromise, or Gateway downtime.
- **P1 (Major):** High slippage (>10%), trade reporting failure, or API rate-limiting.
- **P2 (Minor):** UI glitches, minor latency, or non-critical script errors.

## 2. Response Workflow / 响应流程
1. **Detection:** Real-time alerts via `shared/notifier.js`.
2. **Triage:** Lead Engineer evaluates severity within 15 minutes.
3. **Containment:** Execute `/kill_switch` to halt all active bot sessions.
4. **Resolution:** Patch deployment or manual rollback.

## 3. Rollback Procedure / 回滚步骤
- **Database:** Restore SQLite snapshot from `data/backups/`.
- **Code:** Revert to previous stable Tag on GitHub.
- **Assets:** Revoke session keys in the Signer Service if compromise is suspected.
