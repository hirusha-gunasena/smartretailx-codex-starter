import http from 'k6/http';
import { check, sleep } from 'k6';
import { AUTH_TOKEN, BASE_URL, commonHeaders } from './common.js';

const requiredOrderBaseUrl = (__ENV.ORDER_BASE_URL || '').trim();
if (!/^https?:\/\/[^\s/]+/u.test(requiredOrderBaseUrl)) {
  throw new Error('ORDER_BASE_URL must be set to the deployed Order API endpoint.');
}

if (AUTH_TOKEN.length === 0) {
  throw new Error('AUTH_TOKEN is required for the authenticated report evidence run.');
}

const ORDER_BASE_URL = requiredOrderBaseUrl.replace(/\/+$/u, '');
const catalogueExpectedStatus = Number.parseInt(__ENV.CATALOGUE_EXPECTED_STATUS || '200', 10);
if (catalogueExpectedStatus !== 200 && catalogueExpectedStatus !== 403) {
  throw new Error('CATALOGUE_EXPECTED_STATUS must be 200 or 403.');
}

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<2500'],
    'http_req_duration{operation:ListProducts}': ['p(95)<1500'],
    'http_req_duration{operation:ListOrders}': ['p(95)<1500'],
  },
};

const browseOrders = () => {
  const response = http.get(`${ORDER_BASE_URL}/api/v1/orders`, {
    headers: commonHeaders,
    tags: { operation: 'ListOrders' },
  });

  if (
    !check(response, {
      'List Orders is status 200': (result) => result.status === 200,
    })
  ) {
    return;
  }

  let payload;
  try {
    payload = response.json();
  } catch {
    check(null, { 'List Orders returns JSON': () => false });
    return;
  }

  check(payload?.data, {
    'List Orders returns the standard data array': Array.isArray,
  });
};

const browseCatalogue = () => {
  const response = http.get(`${BASE_URL}/api/v1/products`, {
    headers: commonHeaders,
    tags: { operation: 'ListProducts' },
  });

  if (catalogueExpectedStatus === 403) {
    check(response, {
      'Catalogue RBAC denial is status 403': (result) => result.status === 403,
      'Catalogue RBAC denial uses the standard error envelope': (result) => {
        try {
          const payload = result.json();
          return payload?.success === false && payload?.error?.code === 'FORBIDDEN';
        } catch {
          return false;
        }
      },
    });
    return;
  }

  check(response, {
    'List Products is status 200': (result) => result.status === 200,
    'List Products returns the standard data array': (result) => {
      try {
        return Array.isArray(result.json()?.data);
      } catch {
        return false;
      }
    },
  });
};

export default function () {
  browseCatalogue();
  browseOrders();
  sleep(1);
}
