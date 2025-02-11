//import { parse } from "lambda-multipart-parser-v2";

import * as Postgres from "./data/postgres-helper";

const parameterTypes = {
    query: 'queryStringParameters',
    body: 'body',
    formData: 'formData',
    path: 'pathParameters',
    sqs: 'sqsBody',
    none: 'none',
};

const getApp = (handler, config) => async (event, context, callback) => {
    const { validator, type, unknownParameters = false } = config;

    try {
        let data = {};
        if (type === parameterTypes.sqs) {
            if (event.Records != null && event.Records[0] != null) {
                data = (typeof event.Records[0].body !== 'object') ? JSON.parse(event.Records[0].body) : event.Records[0].body;
            } else {
                data = (typeof event.sqsBody !== 'object' && event.sqsBody != null) ? JSON.parse(event.sqsBody) : (event.sqsBody != null ? event.sqsBody : {});
            }
        } else if (type === parameterTypes.body) {
            data = (typeof event.body !== 'object') ? JSON.parse(event.body) : event.body;
        } else if (type === parameterTypes.formData) {
            try {
                //data = await parse(event);
            } catch (e) {
                //console.log(e);
                data = (typeof event.body !== 'object') ? JSON.parse(event.body) : event.body;
            }
        } else if (type === parameterTypes.none) {
            data = {};
            if(typeof event !== 'object') {
                event = {};
            }
        } else {
            data = event[type] || {};
        }

        if(type !== parameterTypes.path && event[parameterTypes.path] != null) {
            data = {
                ...data,
                ...event[parameterTypes.path]
            };
        }

        if(event == null || event === '') {
            event = {};
        }

        event.validData = {};
        if(validator != null) {
            event.validData = await validator.validateAsync(data, { allowUnknown: unknownParameters });
        } else {
            event.validData = data;
        }
        event.cache = {};

        if(config.connectToDatabase) {
            await Postgres.startConnection();
        }

    } catch (err) {
        const eMessage = `invalid ${type}`;
        console.error(eMessage, event[type]);
        console.error(err);
        return error400(eMessage);
    }

    let r = null;
    try {
        r = await handler(event, context, callback);
    } catch (err) {
        console.error('caught exception in handler', err);
        r = error400();
    }

    if (config.connectToDatabase) {
        if (process.env.STAGE !== 'prod') {
            await Postgres.endConnection();
        }
    }

    callback(null, r);

    return r;
};

const getGenericResponse = (statusCode = 200, body = {}) => {
    return {
        statusCode,
        headers: {
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(body),
    };
}

const response200 = (body = {}) => {
    return getGenericResponse(200, {
        ...body,
    });
}

// Bad Request
const error400 = (message = '400', body = {}) => {
    return getGenericResponse(400, {
        ...body,
        message,
    });
}

// Unauthorized
const error401 = (message = '401', body = {}) => {
    return getGenericResponse(401, {
        ...body,
        message,
    });
}

// Not Found
const error404 = (message = '404', body = {}) => {
    return getGenericResponse(404, {
        ...body,
        message,
    });
}

export {
    parameterTypes,
    getApp,
    getGenericResponse,
    response200,
    error400,
    error401,
    error404
};
