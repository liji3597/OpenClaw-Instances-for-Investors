#!/usr/bin/env node
/**
 * postinstall hook — show a friendly message after npm install
 */
console.log(`
┌──────────────────────────────────────────────┐
│  🦅 OpenClaw Investor Suite installed!        │
│                                              │
│  To deploy skills to your OpenClaw:           │
│    npx openclaw-investor-setup                │
│                                              │
│  Or specify a custom workspace path:          │
│    npx openclaw-investor-setup /your/path     │
└──────────────────────────────────────────────┘
`);
