import Joi from "joi";
import heliusHelper from "../../../../helpers/data/helius-helper.js";
import { getApp, parameterTypes, response200, response400 } from "../../../../helpers/api.js";

const config = {
    type: parameterTypes.query,
    unknownParameters: true,
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
        const transactionsByMint = await heliusHelper.getTokenTransactions(wallet, days);
        
        // Convert the data structure
        const tokenMetadata = {};
        
        Object.entries(transactionsByMint).forEach(([mint, data]) => {
            if (mint === 'SOL') return;
            
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