import Joi from "joi";
import heliusHelper from "../../../../helpers/data/helius-helper.js";
import { getApp, parameterTypes, response200, response400 } from "../../../../helpers/api.js";
import { startConnection, upsertTrades, getLatestTradeTimestamp } from "../../../../helpers/data/postgres-helper.js";

const config = {
    type: parameterTypes.query,
    unknownParameters: true,
    connectToDatabase: true,
    validator: Joi.object({
        wallet: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
        days: Joi.number().integer().min(1).max(90).optional(),
        includeTransactions: Joi.boolean().optional()
    })
};

const handler = getApp(async (event) => {
    const { wallet, days = 30, includeTransactions = false } = event.validData;

    if (!wallet) {
        return response400("Wallet address is required");
    }

    try {
        // Calculate start of day N days ago as our maximum lookback
        const now = new Date();
        const maxLookback = new Date(now);
        maxLookback.setDate(maxLookback.getDate() - days);
        maxLookback.setHours(0, 0, 0, 0); // Set to start of day

        // Get the latest trade timestamp from the database
        const latestTradeTimestamp = await getLatestTradeTimestamp(wallet);
        
        // Use the latest trade timestamp if it exists and is within our lookback period
        // otherwise use the maximum lookback time
        const startTime = latestTradeTimestamp && new Date(latestTradeTimestamp) > maxLookback
            ? latestTradeTimestamp
            : maxLookback;

        console.log('[trades] Fetching transactions', {
            wallet,
            days,
            maxLookback: maxLookback.toISOString(),
            latestTradeTimestamp: latestTradeTimestamp?.toISOString(),
            startTime: startTime.toISOString()
        });

        const transactionsByMint = await heliusHelper.getTokenTransactions(wallet, startTime);
        
        // Convert the data structure and prepare database records
        const tokenMetadata = {};
        const trades = [];
        
        Object.entries(transactionsByMint).forEach(([mint, data]) => {
            if (mint === 'SOL') return;
            
            // Prepare response metadata
            tokenMetadata[mint] = {
                contractAddress: mint,
                tokenName: data.metadata.token_name,
                totalBought: data.metadata.buys,
                totalSold: data.metadata.sells,
                totalSolSpent: data.metadata.invested_sol,
                totalSolReceived: data.metadata.total_sol_received,
                realizedPnl: data.metadata.realized_pnl,
                roi: data.metadata.roi,
                firstTrade: data.metadata.first_trade,
                lastTrade: data.metadata.last_trade
            };

            // Prepare database record
            trades.push({
                id: `${wallet}|${mint}`,
                wallet,
                token_name: data.metadata.token_name,
                token_address: mint,
                first_trade: data.metadata.first_trade,
                last_trade: data.metadata.last_trade,
                buys: data.metadata.buys,
                sells: data.metadata.sells,
                invested_sol: data.metadata.invested_sol,
                realized_pnl: data.metadata.realized_pnl,
                roi: data.metadata.roi
            });

            if (includeTransactions) {
                tokenMetadata[mint].transactions = data.transactions.map(tx => ({
                    signature: tx.signature,
                    timestamp: tx.blockTime,
                    type: tx.type,
                    success: tx.success,
                    fee: tx.fee,
                    preBalances: tx.preTokenBalances,
                    postBalances: tx.postTokenBalances,
                    solMovement: tx.solMovement
                }));
            }
        });

        // Insert trades into database
        if (trades.length > 0) {
            const success = await upsertTrades(trades);
            if (!success) {
                console.error('Failed to insert trades into database');
            }
        }

        return response200({ tokenMetadata });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return response200({ 
            tokenMetadata: {},
            error: error.message || 'Error fetching transactions'
        });
    }
}, config);

export { handler };