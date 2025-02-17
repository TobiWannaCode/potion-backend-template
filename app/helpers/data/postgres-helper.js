import postgres from "postgres";

import { POSTGRES } from "../constants.js";

let sql = null;

const startConnection = async () => {
    if (sql == null) {
        // @ts-ignore
        sql = postgres(`postgresql://${POSTGRES.postgresUsername}:${POSTGRES.postgresPassword}@${POSTGRES.postgresURL}:${POSTGRES.postgresPort}/${POSTGRES.postgresDatabase}`, {
            prepare: false,
            connect_timeout: 12,
        });
    }
};

const getOneByID = async (tableName, data, idName = 'id') => {
    try {
        let result = await sql`
            SELECT *
            FROM ${sql(tableName)}
            ${
            data[idName]
                ? sql`where ${sql(idName)} = ${ data[idName] }`
                : sql``
        }
            `;
        return result[0];
    } catch(e) {
        console.error(e);
        return null;
    }
}

const selectMany = async (query) => {
    try {
        let result = await query;
        return result;
    } catch(e) {
        console.error(e);
        return null;
    }
}

const selectOne = async (query) => {
    try {
        let result = await query;
        return result[0];
    } catch(e) {
        console.error(e);
        return null;
    }
}

const insertOne = async (tableName, data, values, logError = false, idName = 'id') => {
    try {
        let result = await sql`
            INSERT INTO ${sql(tableName)} ${
                sql(data, values)
            } 
            RETURNING ${sql(idName)}`;
        return result[0][idName];
    } catch(e) {
        if(logError) {
            console.error(e);
        }
        return null;
    }
}

const insertMany = async (tableName, data) => {
    try {
        let result = await sql`
            INSERT INTO ${sql(tableName)} ${sql(data)} 
            RETURNING id`;
        return result;
    } catch(e) {
        console.error(e);
        return null;
    }
}

const upsertOne = async (tableName, data, values) => {
    try {
        let result = await sql`
            INSERT INTO ${sql(tableName)} ${
            sql(data, values)
        }
            ON CONFLICT (normalized) DO UPDATE SET normalized=EXCLUDED.normalized 
            RETURNING id`;
        return result[0].id;
    } catch(e) {
        console.error(e);
        return null;
    }
}

const updateOne = async (tableName, id, data, values, idName = 'id') => {
    try {
        await sql`
            UPDATE ${sql(tableName)} 
            SET ${
            sql(data, values)
        }
            WHERE ${sql(idName)} = ${id}`
        return true;
    } catch(e) {
        console.error(e);
        return false;
    }
}

const upsertTrades = async (trades) => {
    try {
        const queries = trades.map(trade => sql`
            INSERT INTO trades (
                id,
                wallet,
                token_name,
                token_address,
                first_trade,
                last_trade,
                buys,
                sells,
                invested_sol,
                realized_pnl,
                roi
            ) VALUES (
                ${trade.id},
                ${trade.wallet},
                ${trade.token_name},
                ${trade.token_address},
                ${trade.first_trade},
                ${trade.last_trade},
                ${trade.buys},
                ${trade.sells},
                ${trade.invested_sol},
                ${trade.realized_pnl},
                ${trade.roi}
            )
            ON CONFLICT (id) DO UPDATE SET
                first_trade = EXCLUDED.first_trade,
                last_trade = EXCLUDED.last_trade,
                buys = EXCLUDED.buys,
                sells = EXCLUDED.sells,
                invested_sol = EXCLUDED.invested_sol,
                realized_pnl = EXCLUDED.realized_pnl,
                roi = EXCLUDED.roi
        `);

        await sql.begin(async sql => {
            for (const query of queries) {
                await query;
            }
        });

        return true;
    } catch (error) {
        console.error('[upsertTrades] Error:', error);
        return false;
    }
};

const getLatestTradeTimestamp = async (wallet) => {
    try {
        const result = await sql`
            SELECT MAX(last_trade) as latest_trade
            FROM trades
            WHERE wallet = ${wallet}
        `;
        return result[0]?.latest_trade || null;
    } catch (error) {
        console.error('[getLatestTradeTimestamp] Error:', error);
        return null;
    }
};

const getWalletTrades = async (wallet) => {
    try {
        const result = await sql`
            SELECT *
            FROM trades
            WHERE wallet = ${wallet}
        `;
        return result;
    } catch (error) {
        console.error('[getWalletTrades] Error:', error);
        return [];
    }
};

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

const getWalletTradesSorted = async (wallet, sortBy = 'last_trade', sortByOrder = 'DESC') => {
    try {
        // Validate sort field to prevent SQL injection
        if (!VALID_SORT_FIELDS.includes(sortBy)) {
            throw new Error('Invalid sort field');
        }

        // Validate sort order to prevent SQL injection
        const order = sortByOrder.toUpperCase();
        if (!['ASC', 'DESC'].includes(order)) {
            throw new Error('Invalid sort order');
        }

        // Create the order by clause using sql identifier for column name
        const result = await sql`
            SELECT 
                token_name,
                token_address,
                first_trade,
                last_trade,
                buys,
                sells,
                invested_sol,
                realized_pnl,
                roi
            FROM trades 
            WHERE wallet = ${wallet}
            ORDER BY ${sql(sortBy)} ${order === 'DESC' ? sql`DESC` : sql`ASC`}
        `;

        return result;
    } catch (error) {
        console.error('[getWalletTradesSorted] Error:', error);
        throw error;
    }
};

const endConnection = async () => {
    if(sql != null) {
        await sql.end();
        sql = null;
    }
};

export {
    sql,
    startConnection,
    endConnection,
    getOneByID,
    selectMany,
    selectOne,
    insertOne,
    insertMany,
    upsertOne,
    updateOne,
    upsertTrades,
    getLatestTradeTimestamp,
    getWalletTrades,
    getWalletTradesSorted
};
