CREATE TABLE IF NOT EXISTS trades (
    -- Primary key as concatenation of wallet and token_address
    id VARCHAR(255) PRIMARY KEY,
    wallet VARCHAR(255) NOT NULL,
    token_name VARCHAR(255) NOT NULL,
    token_address VARCHAR(255) NOT NULL,
    first_trade TIMESTAMP WITH TIME ZONE,
    last_trade TIMESTAMP WITH TIME ZONE,
    buys INTEGER DEFAULT 0,
    sells INTEGER DEFAULT 0,
    invested_sol DECIMAL(20, 8) DEFAULT 0,
    invested_sol_usd DECIMAL(20, 2) DEFAULT 0,
    realized_pnl DECIMAL(20, 8) DEFAULT 0,
    realized_pnl_usd DECIMAL(20, 2) DEFAULT 0,
    roi DECIMAL(10, 2) DEFAULT 0,
    
    -- Add indexes for common queries
    CONSTRAINT unique_wallet_token UNIQUE (wallet, token_address),
    -- Add check constraints
    CONSTRAINT positive_buys CHECK (buys >= 0),
    CONSTRAINT positive_sells CHECK (sells >= 0)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
CREATE INDEX IF NOT EXISTS idx_trades_token_address ON trades(token_address);
CREATE INDEX IF NOT EXISTS idx_trades_last_trade ON trades(last_trade DESC);
