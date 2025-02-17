# Potion Backend Template

This project was originally designed as a serverless application but has been adapted to use Docker for deployment flexibility. It provides a robust system for tracking and analyzing Solana token transactions using Helius RPC.

## Environment Configuration

The application uses environment variables for configuration. Here's what you need in your `.env` file:

```ini
# Database Configuration
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DATABASE=potion
POSTGRES_PORT=5432
POSTGRES_URL=localhost

# Helius Configuration
HELIUS_API_KEY=your_helius_api_key_here
HELIUS_RPC_URL=https://mainnet.helius-rpc.com
HELIUS_RATE_LIMIT_MS=333  # ~3 calls per second

# Application Configuration
NODE_ENV=development
PORT=3000
```

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/potion-backend-template.git
   cd potion-backend-template
   ```

2. Create your `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start the containers:
   ```bash
   docker-compose up
   ```

## API Endpoints

### Sync Wallet Transactions
Triggers a sync of transactions for configured wallets:
```bash
curl -X POST http://localhost:3000/wallets/sync
```

### Get Wallet Trades
Retrieves trades for a specific wallet with optional sorting:
```bash
curl "http://localhost:3000/wallets/trades?address=YOUR_WALLET_ADDRESS&sortBy=roi&sortByOrder=DESC"
```

## Technical Details

### Technology Stack
- **Node.js**: Powers the backend server and API endpoints
- **PostgreSQL**: Stores wallet transactions and trade data
- **Helius RPC**: Provides Solana blockchain data access
- **Docker**: Containerizes the application for consistent deployment

### Database Migrations
The project uses a Flyway migration-style migration system for database version control. Migrations are stored in `db/migrations/` and are automatically applied when the application starts. This ensures:
- Consistent database schema across all environments
- Version-controlled database changes
- Automatic application of new changes
- Rollback capability if needed

### Transaction Sync Process

The sync process is optimized to minimize RPC calls and ensure data consistency:

1. **Initial Check**:
   - For each wallet, check if there are any cached transactions in the last 30 days
   - If transactions exist, get the timestamp of the most recent transaction

2. **Smart Fetching**:
   - If recent transactions exist, only fetch transactions newer than the latest stored
   - If no transactions exist, fetch all transactions from the last 30 days
   - This minimizes RPC calls and ensures we don't miss any transactions

3. **Data Merging**:
   When new transactions are found for existing tokens:
   - First trade date is set to the earliest between existing and new
   - Last trade date is updated to the latest
   - Buys and sells are accumulated
   - Invested SOL and realized PnL are properly summed
   - ROI % is recalculated based on the updated totals

### Potential Improvements

1. **Database Optimizations**:
   - Implement batch processing for database inserts when handling wallets with large transaction histories

2. **Data Management**:
   - Add pruning mechanism for inactive wallets or old trade data

3. **Monitoring and Reliability**:
   - Implement metrics collection for RPC calls, database operations, and sync jobs
   - Add automated alerts for failed syncs or error conditions

4. **API Enhancements**:
   - Add pagination for trade results
   - Add aggregated statistics endpoints (e.g., total portfolio value, daily/weekly/monthly performance)
