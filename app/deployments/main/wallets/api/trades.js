import Joi from "joi";
import heliusHelper from "../../../../helpers/data/helius-helper.js";
import { getApp, parameterTypes, response200, response400 } from "../../../../helpers/api.js";
import { startConnection, upsertTrades, getLatestTradeTimestamp, getWalletTrades } from "../../../../helpers/data/postgres-helper.js";

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

const mergeTrades = (existingTrade, newTrade) => {
    // Parse numeric values, ensuring we have valid numbers
    const parseNumber = (value) => {
        if (typeof value === 'string') {
            return parseFloat(value) || 0;
        }
        return typeof value === 'number' ? value : 0;
    };

    const totalInvestedSol = parseNumber(existingTrade.invested_sol) + parseNumber(newTrade.invested_sol);
    const totalRealizedPnl = parseNumber(existingTrade.realized_pnl) + parseNumber(newTrade.realized_pnl);
    
    return {
        ...newTrade,
        first_trade: new Date(Math.min(
            new Date(existingTrade.first_trade || newTrade.first_trade).getTime(),
            new Date(newTrade.first_trade).getTime()
        )),
        last_trade: new Date(Math.max(
            new Date(existingTrade.last_trade || newTrade.last_trade).getTime(),
            new Date(newTrade.last_trade).getTime()
        )),
        buys: parseNumber(existingTrade.buys) + parseNumber(newTrade.buys),
        sells: parseNumber(existingTrade.sells) + parseNumber(newTrade.sells),
        invested_sol: Number(totalInvestedSol.toFixed(8)), // Ensure 8 decimal places for SOL
        realized_pnl: Number(totalRealizedPnl.toFixed(8)), // Ensure 8 decimal places for SOL
        roi: totalInvestedSol > 0 ? Number((totalRealizedPnl / totalInvestedSol * 100).toFixed(2)) : 0 // 2 decimal places for percentage
    };
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

        // Get existing trades from database
        const existingTrades = await getWalletTrades(wallet);
        const existingTradesMap = existingTrades.reduce((acc, trade) => {
            acc[trade.token_address] = trade;
            return acc;
        }, {});

        const transactionsByMint = await heliusHelper.getTokenTransactions(wallet, startTime);
        
        // Convert the data structure and prepare database records
        const tokenMetadata = {};
        const trades = [];
        
        Object.entries(transactionsByMint).forEach(([mint, data]) => {
            if (mint === 'SOL') return;
            
            // Prepare base trade data
            const newTrade = {
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
            };

            // Merge with existing trade data if it exists
            const existingTrade = existingTradesMap[mint];
            const mergedTrade = existingTrade ? mergeTrades(existingTrade, newTrade) : newTrade;
            trades.push(mergedTrade);
            
            // Prepare response metadata
            tokenMetadata[mint] = {
                contractAddress: mint,
                tokenName: mergedTrade.token_name,
                totalBought: mergedTrade.buys,
                totalSold: mergedTrade.sells,
                totalSolSpent: mergedTrade.invested_sol,
                totalSolReceived: mergedTrade.total_sol_received,
                realizedPnl: mergedTrade.realized_pnl,
                roi: mergedTrade.roi,
                firstTrade: mergedTrade.first_trade,
                lastTrade: mergedTrade.last_trade
            };

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

        // Insert merged trades into database
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