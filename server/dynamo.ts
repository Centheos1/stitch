import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

if (!process.env.TABLE_NAME) {
  throw new Error("TABLE_NAME must be set. Did you forget to provision the DynamoDB table?");
}

export const tableName = process.env.TABLE_NAME;

const client = new DynamoDBClient({});
export const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});
