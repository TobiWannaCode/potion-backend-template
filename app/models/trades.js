import _ from 'lodash';
import * as Postgres from "../helpers/data/postgres-helper.js";
import { sql } from "../helpers/data/postgres-helper.js";

const TABLE_NAME = 'trades';

const create = async (data) => {
    // Generate ID from wallet and token_address
    const id = `${data.wallet}|${data.token_address}`;
    
    // Ensure all numeric fields are defaulted to 0
    const defaultData = {
        buys: 0,
        sells: 0,
        invested_sol: 0,
        invested_sol_usd: 0,
        realized_pnl: 0,
        realized_pnl_usd: 0,
        roi: 0,
        ...data,
        id
    };

    return await sql`
        INSERT INTO ${sql(TABLE_NAME)} ${sql(defaultData)}
        ON CONFLICT (id) DO UPDATE SET
            token_name = EXCLUDED.token_name,
            last_trade = EXCLUDED.last_trade,
            buys = ${sql(TABLE_NAME)}.buys + EXCLUDED.buys,
            sells = ${sql(TABLE_NAME)}.sells + EXCLUDED.sells,
            invested_sol = ${sql(TABLE_NAME)}.invested_sol + EXCLUDED.invested_sol,
            invested_sol_usd = ${sql(TABLE_NAME)}.invested_sol_usd + EXCLUDED.invested_sol_usd,
            realized_pnl = ${sql(TABLE_NAME)}.realized_pnl + EXCLUDED.realized_pnl,
            realized_pnl_usd = ${sql(TABLE_NAME)}.realized_pnl_usd + EXCLUDED.realized_pnl_usd,
            roi = CASE 
                WHEN ${sql(TABLE_NAME)}.invested_sol_usd > 0 
                THEN (${sql(TABLE_NAME)}.realized_pnl_usd / ${sql(TABLE_NAME)}.invested_sol_usd) * 100 
                ELSE 0 
            END
        RETURNING *
    `;
};

const read = async (id) => {
    return await sql`
        SELECT * FROM ${sql(TABLE_NAME)}
        WHERE id = ${id}
    `;
};

const searchByWallet = async (wallet, sortBy = "last_trade", sortDirection = "DESC") => {
    return await sql`
        SELECT *
        FROM ${sql(TABLE_NAME)}
        WHERE wallet = ${wallet}
        ${sortBy === 'last_trade' && sortDirection === 'DESC' ? sql`ORDER BY last_trade DESC NULLS LAST` : sql``}
        ${sortBy === 'last_trade' && sortDirection === 'ASC' ? sql`ORDER BY last_trade ASC NULLS LAST` : sql``}
        ${sortBy === 'roi' && sortDirection === 'DESC' ? sql`ORDER BY roi DESC NULLS LAST` : sql``}
        ${sortBy === 'roi' && sortDirection === 'ASC' ? sql`ORDER BY roi ASC NULLS LAST` : sql``}
        ${sortBy === 'invested_sol' && sortDirection === 'DESC' ? sql`ORDER BY invested_sol DESC NULLS LAST` : sql``}
        ${sortBy === 'invested_sol' && sortDirection === 'ASC' ? sql`ORDER BY invested_sol ASC NULLS LAST` : sql``}
    `;
};

const searchByToken = async (token_address, sortBy = "last_trade", sortDirection = "DESC") => {
    return await sql`
        SELECT *
        FROM ${sql(TABLE_NAME)}
        WHERE token_address = ${token_address}
        ${sortBy === 'last_trade' && sortDirection === 'DESC' ? sql`ORDER BY last_trade DESC NULLS LAST` : sql``}
        ${sortBy === 'last_trade' && sortDirection === 'ASC' ? sql`ORDER BY last_trade ASC NULLS LAST` : sql``}
        ${sortBy === 'roi' && sortDirection === 'DESC' ? sql`ORDER BY roi DESC NULLS LAST` : sql``}
        ${sortBy === 'roi' && sortDirection === 'ASC' ? sql`ORDER BY roi ASC NULLS LAST` : sql``}
        ${sortBy === 'invested_sol' && sortDirection === 'DESC' ? sql`ORDER BY invested_sol DESC NULLS LAST` : sql``}
        ${sortBy === 'invested_sol' && sortDirection === 'ASC' ? sql`ORDER BY invested_sol ASC NULLS LAST` : sql``}
    `;
};

export {
    create,
    read,
    searchByWallet,
    searchByToken
};
