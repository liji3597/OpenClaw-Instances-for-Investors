const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
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

  // Jupiter DEX (swap quotes only — prices come from CoinGecko)
  jupiterQuoteApiBase: 'https://api.jup.ag/swap/v1',

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
};

module.exports = config;
