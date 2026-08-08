export const getProductsTableName = (environment: NodeJS.ProcessEnv = process.env): string => {
  const tableName = environment.PRODUCTS_TABLE_NAME?.trim();

  if (tableName === undefined || tableName.length === 0) {
    throw new Error('PRODUCTS_TABLE_NAME must be configured.');
  }

  return tableName;
};
