#!/usr/bin/env node
/**
 * openclaw-investor-install
 * Copies skills, shared modules, and AGENTS.md into the OpenClaw workspace.
 *
 * Usage:
 *   npx openclaw-investor-suite            (auto-install via postinstall)
 *   openclaw-investor-install              (manual CLI)
 *   openclaw-investor-install /custom/path (custom workspace path)
 */
const fs = require('fs');
const path = require('path');

const pkgRoot = path.resolve(__dirname, '..');
const defaultWorkspace = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.openclaw', 'workspace');
const targetDir = process.argv[2] || defaultWorkspace;

const DIRS_TO_COPY = ['skills', 'shared'];
const FILES_TO_COPY = ['AGENTS.md', '.env.example'];

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

console.log('🦅 OpenClaw Investor Suite — Installing skills...\n');
console.log(`   Source:  ${pkgRoot}`);
console.log(`   Target:  ${targetDir}\n`);

// Copy directories
for (const dir of DIRS_TO_COPY) {
    const src = path.join(pkgRoot, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
        copyRecursive(src, dest);
        console.log(`   ✅ ${dir}/`);
    }
}

// Copy files
for (const file of FILES_TO_COPY) {
    const src = path.join(pkgRoot, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
        // Don't overwrite .env if it already exists
        if (file === '.env.example' && fs.existsSync(path.join(targetDir, '.env'))) {
            console.log(`   ⏭️  ${file} (skipped — .env already exists)`);
        } else {
            fs.copyFileSync(src, dest);
            console.log(`   ✅ ${file}`);
        }
    }
}

console.log(`
✨ Installation complete!

Next steps:
  1. cd ${targetDir}
  2. cp .env.example .env    (configure HELIUS_API_KEY if needed)
  3. Chat with your OpenClaw bot on Telegram — skills are loaded automatically!

📖 Docs: https://github.com/jeseli689/OpenClaw-Instances-for-Investors
`);
