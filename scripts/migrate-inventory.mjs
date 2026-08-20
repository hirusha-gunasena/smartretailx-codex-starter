import { DynamoDBClient, ScanCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'ap-south-1' });
const tableName = 'smartretailx-inventory-dev';

async function migrate() {
  console.log(`Scanning table ${tableName}...`);
  try {
    const scanResponse = await client.send(new ScanCommand({ TableName: tableName }));
    const items = scanResponse.Items || [];

    console.log(`Found ${items.length} items. Migrating...`);

    for (const item of items) {
      if (item.stockLevel) {
        const stock = parseInt(item.stockLevel.N || '0', 10);
        console.log(`Migrating item ${item.productId.S} (stockLevel: ${stock})`);

        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              productId: { S: item.productId.S },
              availableQuantity: { N: stock.toString() },
              updatedAt: { S: new Date().toISOString() },
            },
          }),
        );
        console.log(`Successfully migrated ${item.productId.S}`);
      } else if (item.availableQuantity) {
        console.log(`Item ${item.productId.S} is already migrated.`);
      }
    }

    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
