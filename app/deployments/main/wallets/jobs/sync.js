import _ from "lodash";
import { getApp, parameterTypes, response200 } from "../../../../helpers/api.js";
import { WALLETS } from "../../../../helpers/constants.js";
import heliusHelper from "../../../../helpers/data/helius-helper.js";
import { startConnection, getLatestTradeTimestamp, getWalletTrades, upsertTrades } from "../../../../helpers/data/postgres-helper.js";

const config = {
    type: parameterTypes.none,
    unknownParameters: true,
    connectToDatabase: true,
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

const processWallet = async (wallet) => {
    try {
        console.log(`\nProcessing wallet: ${wallet}`);
        
        // Calculate start of day 30 days ago as our maximum lookback
        const now = new Date();
        const maxLookback = new Date(now);
        maxLookback.setDate(maxLookback.getDate() - 30);
        maxLookback.setHours(0, 0, 0, 0); // Set to start of day

        // Get the latest trade timestamp from the database
        const latestTradeTimestamp = await getLatestTradeTimestamp(wallet);
        
        // Use the latest trade timestamp if it exists and is within our lookback period
        // otherwise use the maximum lookback time
        const startTime = latestTradeTimestamp && new Date(latestTradeTimestamp) > maxLookback
            ? latestTradeTimestamp
            : maxLookback;

        console.log('[sync] Fetching transactions', {
            wallet,
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
        });

        // Insert merged trades into database
        if (trades.length > 0) {
            const success = await upsertTrades(trades);
            if (!success) {
                console.error(`Failed to insert trades for wallet ${wallet}`);
            } else {
                console.log(`Successfully processed ${trades.length} trades for wallet ${wallet}`);
            }
        } else {
            console.log(`No new trades found for wallet ${wallet}`);
        }

        return trades.length;
    } catch (error) {
        console.error(`Error processing wallet ${wallet}:`, error);
        return 0;
    }
};

const handler = getApp(async () => {
    try {
        console.log('Starting wallet sync job');
        console.log('Wallets to process:', WALLETS);

        const results = [];
        for (const wallet of WALLETS) {
            const tradesProcessed = await processWallet(wallet);
            results.push({ wallet, tradesProcessed });
        }

        return response200({
            message: 'Sync job completed',
            results
        });
    } catch (error) {
        console.error('Error in sync job:', error);
        return response200({
            error: error.message || 'Error in sync job'
        });
    }
}, config);

export { handler };
