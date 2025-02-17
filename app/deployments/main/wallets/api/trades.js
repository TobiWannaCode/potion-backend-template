import Joi from "joi";
import heliusHelper from "../../../../helpers/data/helius-helper.js";
import { getApp, parameterTypes, response200, response400 } from "../../../../helpers/api.js";

const config = {
    type: parameterTypes.query,
    unknownParameters: true,
    validator: Joi.object({
        wallet: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
        days: Joi.number().integer().min(1).max(90).optional()
    })
};

const handler = getApp(async (event) => {
    const { wallet, days = 30 } = event.validData;

    if (!wallet) {
        return response400("Wallet address is required");
    }

    try {
        const transactions = await heliusHelper.getTokenTransactions(wallet, days);
        return response200({ transactions });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return response200({ 
            transactions: [],
            error: error.message || 'Error fetching transactions'
        });
    }
}, config);

export { handler };