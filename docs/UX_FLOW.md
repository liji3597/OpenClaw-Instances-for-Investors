# P5 User Safety & Confirmation Flow UX

## 1. Execution Mode Visualization

### 🧪 SIMULATION MODE (P0-P4)
- **Color Indicator**: Green 🟢
- **Header**: `[SIMULATION] Account Balance: $10,000 (Paper)`
- **Context**: Used for testing strategies and onboarding. No real funds at risk.

### 🔴 LIVE MODE (P5+)
- **Color Indicator**: Red 🔴
- **Header**: `⚠️ LIVE EXECUTION ENABLED ⚠️`
- **Warning**: "Real assets are being used. Proceed with caution."
- **Visual Cues**: All confirmation buttons for live trades use the 🚨 emoji.

## 2. User Onboarding Flow (Mandatory for P5)

1.  **Risk Disclosure Acknowledgment**:
    - User receives a comprehensive risk disclosure message.
    - Must click `[I Understand & Accept Risks]` to proceed.
2.  **Simulation Test Flight**:
    - User must successfully complete at least 1 simulation transaction (DCA or Alert).
    - System verifies user understands the interface.
3.  **Whitelist Request**:
    - User submits a request for "Live Alpha" access.
    - Admin reviews and grants access based on account history.
4.  **Identity Verification (Tiered Limits)**:
    - Level 0 (Unverified): Simulation only.
    - Level 1 (Whitelist): Up to $500/day volume.
    - Level 2 (KYC): Custom high-volume limits.

## 3. Human-in-the-loop (HITL) Workflow

Every live transaction follows this 3-step confirmation:
1.  **Intent**: User requests a trade (e.g., "Buy 1 SOL").
2.  **Disclosure**: System presents "Pre-Execution Confirmation" with exact fees, slippage, and a "LIVE EXECUTION WARNING".
3.  **Action**: User clicks `[✅ Confirm]` within a 60-second window (price TTL).

## 4. Emergency Stop Procedures

- **Global Kill-Switch**: Command `/panic` or `/stopall` immediately cancels all pending orders and pauses all active DCA strategies.
- **Individual Stop**: Each active strategy/alert message includes an `[🛑 Stop]` button.
- **Automatic Circuit Breaker**: Risk service automatically halts execution if daily loss or volume limits are exceeded.

## 5. Risk Circuit Breaker Visualization

When a limit is hit, the UI must:
1.  Display a prominent ⛔ icon.
2.  Provide the specific reason (e.g., "Daily volume exceeded").
3.  Show current progress vs limit (e.g., "$487.50 / $500.00").
4.  Provide a clear path to resolution ("Contact support to increase limits").

---
*Design by Gemini CLI Frontend Architect*
