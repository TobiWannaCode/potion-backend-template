import _ from 'lodash';
import * as Postgres from "../helpers/data/postgres-helper";
import { sql } from "../helpers/data/postgres-helper";

const TABLE_NAME = 'trades';

const create = async (data) => {
    data = _.mapValues(data, value => value === undefined ? null : value);
    let useData = {
        ...data,
    };
    return await Postgres.insertOne(TABLE_NAME, useData, _.keys(useData), true, 'id');
};

const read = async (id) => {
    return await Postgres.getOneByID(TABLE_NAME, { id }, 'id');
};

const update = async (id, data) => {
    let useData = {
        updated_at: new Date().toISOString(),
        ...data,
    }
    useData = _.pickBy(useData, _.identity);
    return await Postgres.updateOne(TABLE_NAME, id, useData, _.keys(useData), 'id');
};

const searchByWallet = async (wallet, sortBy = "created_at", sortDirection = "DESC") => {
    try {
        return await sql`
            SELECT *
            FROM ${sql(TABLE_NAME)}
            WHERE wallet = ${wallet}
            ${sortBy === 'created_at' && sortDirection === 'DESC' ? sql`ORDER BY created_at DESC` : sql``}
            ${sortBy === 'created_at' && sortDirection === 'ASC' ? sql`ORDER BY created_at ASC` : sql``}
        `;
    } catch(e) {
        console.error(e);
        return [];
    }
};

export {
    create,
    read,
    update,
    searchByWallet,
}
