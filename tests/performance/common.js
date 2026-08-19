import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'https://api.dev.smartretailx.com';
export const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'ENTER_TOKEN_HERE';
export const PRODUCT_ID = __ENV.PRODUCT_ID || 'sample-product-id';

export const commonHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

export function checkResponse(res, name) {
  check(res, {
    [`${name} is status 200 or 201`]: (r) => r.status === 200 || r.status === 201,
  });
}

export function browseCatalogue() {
  const res = http.get(`${BASE_URL}/api/v1/catalogue`);
  checkResponse(res, 'List Products');
  
  if (res.status === 200) {
    const products = res.json();
    if (products && products.length > 0) {
      const productId = products[0].id;
      const detailRes = http.get(`${BASE_URL}/api/v1/catalogue/${productId}`);
      checkResponse(detailRes, 'Get Product Detail');
    }
  }
}
