import http from 'k6/http';
import { check } from 'k6';

const requiredBaseUrl = (__ENV.BASE_URL || '').trim();
if (!/^https?:\/\/[^\s/]+/u.test(requiredBaseUrl)) {
  throw new Error('BASE_URL must be set to the deployed Catalogue API endpoint.');
}

export const BASE_URL = requiredBaseUrl.replace(/\/+$/u, '');
export const AUTH_TOKEN = (__ENV.AUTH_TOKEN || '').trim();
export const PRODUCT_ID = (__ENV.PRODUCT_ID || '').trim();

if (/ENTER_TOKEN_HERE/iu.test(AUTH_TOKEN)) {
  throw new Error('AUTH_TOKEN contains a placeholder instead of an ephemeral token.');
}

export const commonHeaders = {
  Accept: 'application/json',
  ...(AUTH_TOKEN.length > 0 ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

export function checkResponse(res, name) {
  return check(res, {
    [`${name} is status 200`]: (response) => response.status === 200,
  });
}

export function browseCatalogue() {
  const listResponse = http.get(`${BASE_URL}/api/v1/products`, {
    headers: commonHeaders,
    tags: { operation: 'ListProducts' },
  });
  if (!checkResponse(listResponse, 'List Products')) {
    return;
  }

  let payload;
  try {
    payload = listResponse.json();
  } catch {
    check(null, { 'List Products returns JSON': () => false });
    return;
  }

  const products = payload?.data;
  if (!check(products, { 'List Products returns the standard data array': Array.isArray })) {
    return;
  }

  const productId = PRODUCT_ID || products[0]?.productId;
  if (typeof productId === 'string' && productId.length > 0) {
    const detailResponse = http.get(
      `${BASE_URL}/api/v1/products/${encodeURIComponent(productId)}`,
      {
        headers: commonHeaders,
        tags: { operation: 'GetProduct' },
      },
    );
    checkResponse(detailResponse, 'Get Product Detail');
  }
}
