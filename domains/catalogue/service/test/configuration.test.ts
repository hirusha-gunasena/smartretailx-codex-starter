import { getProductsTableName } from '../src/index.js';

describe('getProductsTableName', () => {
  test('returns the configured PRODUCTS_TABLE_NAME', () => {
    expect(getProductsTableName({ PRODUCTS_TABLE_NAME: ' ProductsTable ' })).toBe('ProductsTable');
  });

  test('fails clearly when PRODUCTS_TABLE_NAME is absent', () => {
    expect(() => getProductsTableName({})).toThrow('PRODUCTS_TABLE_NAME must be configured.');
  });
});
