//import { parse } from "lambda-multipart-parser-v2";

import * as Postgres from "./data/postgres-helper.js";

const parameterTypes = {
    query: 'queryStringParameters',
    body: 'body',
    formData: 'formData',
    path: 'pathParameters',
    sqs: 'sqsBody',
    none: 'none',
};

const getApp = (handler, config) => async (event, context) => {
    const { validator, type, unknownParameters = false } = config;

    try {
        let data = {};
        if (type === parameterTypes.query) {
            data = event.queryStringParameters || {};
        } else if (type === parameterTypes.body) {
            data = (typeof event.body !== 'object') ? JSON.parse(event.body) : event.body;
        } else if (type === parameterTypes.none) {
            data = {};
        } else {
            data = event[type] || {};
        }

        // Validate the data if a validator is provided
        if (validator) {
            const validationResult = validator.validate(data, {
                allowUnknown: unknownParameters,
                abortEarly: false
            });

            if (validationResult.error) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        message: 'Validation error',
                        details: validationResult.error.details
                    })
                };
            }
            event.validData = validationResult.value;
        } else {
            event.validData = data;
        }

        if (config.connectToDatabase) {
            await Postgres.startConnection();
        }

        const result = await handler(event, context);

        if (config.connectToDatabase) {
            if (process.env.STAGE !== 'prod') {
                await Postgres.endConnection();
            }
        }

        return result;
    } catch (error) {
        console.error('Error in handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                error: error.message
            })
        };
    }
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

const response400 = (message = '400', body = {}) => {
    return getGenericResponse(400, {
        ...body,
        message,
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
    response400,
    error400,
    error401,
    error404
};
