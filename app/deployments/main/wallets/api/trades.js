import Joi from "joi";
import { getApp, parameterTypes, response200, response400 } from "../../../../helpers/api.js";
import { getWalletTradesSorted } from "../../../../helpers/data/postgres-helper.js";

const VALID_SORT_FIELDS = [
    'token_name',
    'first_trade',
    'last_trade',
    'buys',
    'sells',
    'invested_sol',
    'realized_pnl',
    'roi'
];

const config = {
    type: parameterTypes.query,
    unknownParameters: true,
    connectToDatabase: true,
    validator: Joi.object({
        address: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).required(),
        sortBy: Joi.string().valid(...VALID_SORT_FIELDS).default('last_trade'),
        sortByOrder: Joi.string().valid('ASC', 'DESC').default('DESC')
    })
};

const handler = getApp(async (event) => {
    const { address, sortBy, sortByOrder } = event.validData;

    try {
        const trades = await getWalletTradesSorted(address, sortBy, sortByOrder);
        
        return response200({
            wallet: address,
            trades: trades.map(trade => ({
                tokenName: trade.token_name,
                tokenAddress: trade.token_address,
                firstTrade: trade.first_trade,
                lastTrade: trade.last_trade,
                totalBought: trade.buys,
                totalSold: trade.sells,
                totalSolSpent: trade.invested_sol,
                realizedPnl: trade.realized_pnl,
                roi: trade.roi
            }))
        });
    } catch (error) {
        console.error('Error in trades handler:', error);
        return response400(error.message || 'Error fetching trades');
    }
}, config);

export { handler };