'use strict';

const _ = require('lodash');
const pathToRegexp = require('path-to-regexp');

const queryParams = require('../query-params');
const cleanSchemaAttributes = require('../clean-schema-attributes');
const getSchemaData = require('../get-schema-data');
const buildApiRequests = require('./build-api-requests');
const buildApiResponses = require('./build-api-responses');

/**
 *
 * @param {boolean} isSingleEntity - Checks for a single entity
 * @returns {object} The correctly formatted meta object
 */
const getMeta = isListOfEntities => {
  if (isListOfEntities) {
    return {
      type: 'object',
      properties: {
        pagination: {
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer', minimum: 25 },
            pageCount: { type: 'integer', maximum: 1 },
            total: { type: 'integer' },
          },
        },
      },
    };
  }

  return { type: 'object' };
};

/**
 * @description Parses a route with ':variable'
 *
 * @param {string} routePath - The route's path property
 * @returns {string}
 */
const parsePathWithVariables = routePath => {
  return pathToRegexp
    .parse(routePath)
    .map(token => {
      if (_.isObject(token)) {
        return token.prefix + '{' + token.name + '}';
      }

      return token;
    })
    .join('');
};

/**
 * @description Builds the required object for a path parameter
 *
 * @param {string} routePath - The route's path property
 *
 * @returns {object } Swagger path params object
 */
const getPathParams = routePath => {
  return pathToRegexp
    .parse(routePath)
    .filter(token => _.isObject(token))
    .map(param => {
      return {
        name: param.name,
        in: 'path',
        description: '',
        deprecated: false,
        required: true,
        schema: { type: 'string' },
      };
    });
};

/**
 *
 * @param {string} prefix - The route prefix
 * @param {string} path - The route path
 *
 * @returns {string}
 */
const getPathWithPrefix = (prefix, path) => {
  if (path.includes('localizations')) {
    return path;
  }

  if (path.endsWith('/')) {
    return prefix;
  }

  return prefix.concat(path);
};

/**
 * @description Builds the paths and schemas for an APi route
 *
 * @param {object} api - Information about the api
 * @param {object} api.routeInfo - The routes for a given api or plugin
 * @param {string} api.routeInfo.prefix - The prefix for all routes
 * @param {array}  api.routeInfo.routes - The routes for the current api
 * @param {object} api.attributes - The attributes for a given api or plugin
 * @param {string} api.tag - A descriptor for OpenAPI
 *
 * @returns {object}
 */
const getRoutePathsAndSchemas = ({ routeInfo, attributes, tag }) => {
  const schemas = {};
  const paths = routeInfo.routes.reduce((acc, route) => {
    // TODO: Find a more reliable way to determine list of entities vs a single entity
    const isListOfEntities = route.handler.split('.').pop() === 'find';
    const methodVerb = route.method.toLowerCase();

    const hasPathParams = route.path.includes('/:');
    const pathWithPrefix = routeInfo.prefix
      ? getPathWithPrefix(routeInfo.prefix, route.path)
      : route.path;
    const routePath = hasPathParams ? parsePathWithVariables(pathWithPrefix) : pathWithPrefix;

    const { responses } = buildApiResponses(tag, route, isListOfEntities);
    for (const response of _.values(responses)) {
      for (const contentTypeResponse of _.values(response.content)) {
        if (_.has(contentTypeResponse.schema, '$ref')) {
          const schemaName = _.last(_.split(contentTypeResponse.schema['$ref'], '/'));
          schemas[schemaName] = {
            type: 'object',
            properties: {
              data: getSchemaData(isListOfEntities, cleanSchemaAttributes(attributes)),
              meta: getMeta(isListOfEntities),
            },
          };
        }
      }
    }

    const swaggerConfig = {
      responses,
      tags: [_.upperFirst(tag)],
      parameters: [],
      requestBody: {},
    };

    if (isListOfEntities) {
      swaggerConfig.parameters.push(...queryParams);
    }

    if (hasPathParams) {
      const pathParams = getPathParams(route.path);
      swaggerConfig.parameters.push(...pathParams);
    }

    if (['post', 'put'].includes(methodVerb)) {
      const { requestBody } = buildApiRequests(attributes, route);

      swaggerConfig.requestBody = requestBody;
    }

    _.set(acc, `${routePath}.${methodVerb}`, swaggerConfig);

    return acc;
  }, {});

  return { paths, schemas };
};

/**
 * @description - Builds the Swagger paths object for each api
 *
 * @param {object} api - Information about the current api
 * @property {string} api.name - The name of the api
 * @property {string} api.getter - The getter for the api (api | plugin)
 * @property {array} api.ctNames - The name of all contentTypes found on the api
 *
 * @returns {object}
 */
module.exports = api => {
  if (!api.ctNames.length && api.getter === 'plugin') {
    // Set arbitrary attributes
    const attributes = { foo: { type: 'string' } };
    const routeInfo = strapi.plugin(api.name).routes['admin'];

    const apiInfo = {
      routeInfo,
      attributes,
      tag: api.name,
    };

    return getRoutePathsAndSchemas(apiInfo);
  }

  let pathAndSchemaObject = {
    paths: {},
    components: {
      schemas: {},
    },
  };

  // An api could have multiple contentTypes
  for (const contentTypeName of api.ctNames) {
    // Get the attributes found on the api's contentType
    const uid = `${api.getter}::${api.name}.${contentTypeName}`;
    const ct = strapi.contentType(uid);
    const attributes = ct.attributes;

    // Get the routes for the current api
    const routeInfo =
      api.getter === 'plugin'
        ? strapi.plugin(api.name).routes['content-api']
        : strapi.api[api.name].routes[contentTypeName];

    // Parse an identifier for OpenAPI tag if the api name and contentType name don't match
    const tag = api.name === contentTypeName ? api.name : `${api.name} - ${contentTypeName}`;
    const apiInfo = {
      routeInfo,
      attributes,
      tag,
    };

    const { paths, schemas } = getRoutePathsAndSchemas(apiInfo);
    pathAndSchemaObject = {
      paths: {
        ...pathAndSchemaObject.paths,
        ...paths,
      },
      schemas: {
        ...pathAndSchemaObject.schemas,
        ...schemas,
      },
    };
  }
  return pathAndSchemaObject;
};
