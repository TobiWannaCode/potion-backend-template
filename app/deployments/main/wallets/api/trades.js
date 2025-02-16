import _ from "lodash";
import Joi from "joi";
import * as Trades from "../../../../models/trades.js";
import { getApp, parameterTypes, response200 } from "../../../../helpers/api.js";

const config = {
    type: parameterTypes.query,
    unknownParameters: true,
    connectToDatabase: true,
    validator: Joi.object({
        wallet: Joi.string(),
        token_address: Joi.string(),
        sortBy: Joi.string().valid("last_trade", "roi", "invested_sol").optional(),
        sortDirection: Joi.string().valid("ASC", "DESC").optional(),
    })
};

const handler = getApp(async (event) => {
    const { wallet, token_address, sortBy = "last_trade", sortDirection = "DESC" } = event.validData;

    let trades;
    if (wallet) {
        trades = await Trades.searchByWallet(wallet, sortBy, sortDirection);
    } else if (token_address) {
        trades = await Trades.searchByToken(token_address, sortBy, sortDirection);
    } else {
        trades = [];
    }

    return response200({
        trades: trades,
        count: trades.length,
        sortBy,
        sortDirection
    });
}, config);

export { handler };