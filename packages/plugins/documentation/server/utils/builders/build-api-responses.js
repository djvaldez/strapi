'use strict';

const _ = require('lodash');
const errorResponse = require('../error-response');

/**
 * @description - Builds the Swagger response object for a given api
 *
 * @param {string} tag - The path tag
 * @param {object} route - The current route
 *
 * @returns The Swagger responses
 */
module.exports = (tag, route, isListOfEntities = false) => {
  let schema;
  if (route.method === 'DELETE') {
    schema = {
      type: 'integer',
      format: 'int64',
    };
  } else {
    const responseName = `${_.words(_.startCase(tag)).join('')}${
      isListOfEntities ? 'List' : ''
    }Response`;
    schema = {
      $ref: `#/components/schemas/${responseName}`,
    };
  }

  return {
    responses: {
      '200': {
        content: {
          'application/json': {
            schema,
          },
        },
      },
      '400': {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
      '403': {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
      '404': {
        description: 'Not Found',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
      '500': {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: errorResponse,
          },
        },
      },
    },
  };
};
