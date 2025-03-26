# Google Sheets API Edge Function

This Edge Function provides a secure, rate-limited API for updating Google Sheets. It can be used to append rows to a sheet or update specific cells.

## Features

- Google Sheets API integration
- Authentication and authorization
- Input validation
- CORS protection
- Rate limiting
- Error handling
- Slack notifications for errors

## Setup Instructions

### 1. Set Up a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the Google Sheets API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it

### 2. Create a Service Account

1. In your Google Cloud project, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Fill in the name and description for your service account
4. Click "Create and Continue"
5. Add roles (Project > Editor is sufficient for most cases)
6. Click "Done"

### 3. Generate a Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose JSON format
5. Click "Create"
6. Save the downloaded JSON file securely

### 4. Share Your Google Sheet

1. Create a new Google Sheet (or use an existing one)
2. Share it with the service account email (found in the JSON key file under `client_email`)
3. Give the service account "Editor" access

### 5. Configure Your Environment

Create an `.env` file with the following variables:

```
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project-ref.supabase.co
GOOGLE_SHEET_ID=your-sheet-id-for-testing
SLACK_WEBHOOK_URL=your-slack-webhook-url (optional)
```

For production, add your Google service account key to Supabase secrets:

```bash
# Base64 encode your service account key file
cat keys.json | base64 | tr -d '\n' > key.base64

# Set it as a secret in Supabase
npx supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY_BASE64="$(cat key.base64)"
```

## Deployment and Testing

1. Install dependencies:

```bash
npm install
```

2. Deploy the function to your Supabase project:

```bash
npm run deploy
# or directly with npx
npx supabase functions deploy update-colorworks-google-sheet
```

3. Test the deployed function using the provided test script:

```bash
npm run test
# or directly with bash
bash ./test-function.sh
```

## Available Scripts

This project includes several npm scripts to make working with the function easier:

- `npm run deploy` - Deploy the function to Supabase
- `npm run test` - Test the function (using test-function.sh)
- `npm run test:deployed` - Test the function using test-deployed-function.sh
- `npm run sheet:create` - Interactive utility to create a new Google Sheet
- `npm run sheet:test` - Test access to your Google Sheet
- `npm run sheet:update-id` - Update the Google Sheet ID in your .env file and test scripts

## TypeScript Issues

When working with the code, you may encounter TypeScript errors for npm packages. Fix these by:

1. Adding `//@ts-expect-error` before import statements:

```typescript
// For npm packages
//@ts-expect-error
const { GoogleSpreadsheet } = await import("npm:google-spreadsheet@3.3.0");
```

2. For file system access, avoid using direct file reads and instead use environment variables:

```typescript
// Instead of:
const localKeyFile = await Deno.readTextFile("../../../keys.json");

// Use:
const rawServiceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}";
```

## API Usage

### Authentication

All requests must include a valid Supabase authentication token in the Authorization header:

```
Authorization: Bearer your-supabase-anon-key
```

### Request Format

#### To Update Specific Cells

```json
{
  "sheetId": "your-google-sheet-id",
  "tabName": "Sheet1",
  "values": [
    [0, 0, "Value for cell A1"],
    [0, 1, "Value for cell B1"],
    [1, 0, "Value for cell A2"]
  ]
}
```

#### To Append Rows

```json
{
  "sheetId": "your-google-sheet-id",
  "tabName": "Sheet1",
  "values": [
    {
      "Name": "John Doe",
      "Email": "john@example.com",
      "Date": "2023-01-01"
    }
  ],
  "append": true
}
```

## Rate Limiting

The API is rate-limited to 10 requests per minute per IP address to prevent abuse.

## Error Notifications

If you configured a Slack webhook URL, the function will send notifications for any errors that occur during execution.
