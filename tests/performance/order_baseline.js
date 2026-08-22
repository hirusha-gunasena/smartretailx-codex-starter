import http from 'k6/http';
import { check, sleep } from 'k6';
import { AUTH_TOKEN, commonHeaders } from './common.js';

const requiredOrderBaseUrl = (__ENV.ORDER_BASE_URL || '').trim();
if (!/^https?:\/\/[^\s/]+/u.test(requiredOrderBaseUrl)) {
  throw new Error('ORDER_BASE_URL must be set to the deployed Order API endpoint.');
}

if (AUTH_TOKEN.length === 0) {
  throw new Error('AUTH_TOKEN is required for the authenticated Order baseline.');
}

const ORDER_BASE_URL = requiredOrderBaseUrl.replace(/\/+$/u, '');

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.get(`${ORDER_BASE_URL}/api/v1/orders`, {
    headers: commonHeaders,
    tags: { operation: 'ListOrders' },
  });

  check(response, {
    'List Orders is status 200': (result) => result.status === 200,
    'List Orders returns the standard data array': (result) => {
      try {
        return Array.isArray(result.json()?.data);
      } catch {
        return false;
      }
    },
  });
  sleep(1);
}
