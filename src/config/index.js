require('dotenv').config();

const config = {
  // Telegram
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // Solana
  solanaNetwork: process.env.SOLANA_NETWORK || 'devnet',
  heliusApiKey: process.env.HELIUS_API_KEY || '',

  get rpcUrl() {
    if (this.heliusApiKey) {
      const network = this.solanaNetwork === 'mainnet-beta' ? 'mainnet' : this.solanaNetwork;
      return `https://${network}.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    }
    const urls = {
      'mainnet-beta': 'https://api.mainnet-beta.solana.com',
      'devnet': 'https://api.devnet.solana.com',
      'testnet': 'https://api.testnet-beta.solana.com',
    };
    return urls[this.solanaNetwork] || urls.devnet;
  },

  // Jupiter API — v3 (v2 deprecated since Sep 2025)
  jupiterPriceApiBase: 'https://api.jup.ag/price/v3',
  jupiterQuoteApiBase: 'https://api.jup.ag/swap/v1',

  // Price monitoring
  priceCheckInterval: parseInt(process.env.PRICE_CHECK_INTERVAL || '60', 10) * 1000,

  // DCA
  defaultSlippageBps: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '50', 10),

  // Database
  databasePath: process.env.DATABASE_PATH || './data/openclaw.db',

  // Well-known Solana token mints
  tokens: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  },

  // Token decimals (for formatting)
  tokenDecimals: {
    'So11111111111111111111111111111111111111112': 9,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6,
  },

  validate() {
    const errors = [];
    if (!this.telegramToken) errors.push('TELEGRAM_BOT_TOKEN is required');
    if (errors.length > 0) {
      console.error('❌ Configuration errors:');
      errors.forEach(e => console.error(`  - ${e}`));
      console.error('\nPlease copy .env.example to .env and fill in the required values.');
      process.exit(1);
    }
    if (!this.heliusApiKey) {
      console.warn('⚠️  HELIUS_API_KEY not set — using public Solana RPC (rate-limited)');
    }
  },
};

module.exports = config;
