import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest } from "../_shared/validate-request.ts";
import { notifySlack } from "../_shared/notify-slack.ts";

// Define local types to work around TypeScript import issues
// These are simplified versions of the actual types, containing just what we need
type GoogleSpreadsheetWorksheet = {
  addRows: (rows: any[]) => Promise<any>;
  loadCells: () => Promise<void>;
  getCell: (row: number, col: number) => { value: any };
  saveUpdatedCells: () => Promise<void>;
};

type GoogleSpreadsheetType = {
  useServiceAccountAuth: (credentials: { client_email: string; private_key: string }) => Promise<void>;
  loadInfo: () => Promise<void>;
  sheetsByTitle: Record<string, GoogleSpreadsheetWorksheet>;
  addSheet: (options: { title: string }) => Promise<GoogleSpreadsheetWorksheet>;
  title: string;
};

// Import the actual packages/
//@ts-expect-error
const { GoogleSpreadsheet } = await import("npm:google-spreadsheet@3.3.0");

//@ts-expect-error
const { JWT } = await import("npm:google-auth-library@8.9.0");

// Rate limiting
const RATE_LIMIT_NUM = 10; // Number of requests allowed
const RATE_LIMIT_WINDOW_MS = 60000; // Time window in milliseconds (1 minute)
const ipRequestMap = new Map<string, { count: number; resetTime: number }>();

console.info("Google Sheets update function started");

// Helper function to check if EdgeRuntime exists and use waitUntil
async function useEdgeRuntimeWaitUntil(promise: Promise<any>): Promise<void> {
  // Check if EdgeRuntime exists with typeof to avoid reference errors
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && 'waitUntil' in EdgeRuntime) {
    // @ts-ignore - We've checked that it exists and has waitUntil
    EdgeRuntime.waitUntil(promise);
  } else {
    // If EdgeRuntime is not available, just await the promise
    await promise;
  }
}

/**
 * Helper function to get service account credentials from various sources
 * Prioritizes:
 * 1. Local file (for development)
 * 2. Environment variable (for production)
 */
async function getServiceAccountCreds() {
  let serviceAccountCreds: any = null;
  
  try {
    // Skip local file reading in production mode to avoid errors
    // In development, manual handling would be needed
    
    // Try to get from base64 encoded environment variable (new method)
    try {
      console.info("Attempting to read base64 encoded service account key...");
      const base64Key = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
      
      if (base64Key) {
        // Decode from base64
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(
          Uint8Array.from(atob(base64Key), c => c.charCodeAt(0))
        );
        
        serviceAccountCreds = JSON.parse(jsonStr);
        
        // Verify we have the required fields
        if (serviceAccountCreds.client_email && serviceAccountCreds.private_key) {
          console.info("Service account key decoded from base64 successfully");
          return serviceAccountCreds;
        }
      }
    } catch (error) {
      const base64Error = error as Error;
      console.warn("Could not decode base64 key:", base64Error.message);
    }
    
    // Otherwise, get from environment variable (for production)
    console.info("Attempting to read service account key from environment variable...");
    const rawServiceAccountKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}";
    
    // Try direct parsing
    serviceAccountCreds = JSON.parse(rawServiceAccountKey);
    
    // If result is a string, we have double encoding
    if (typeof serviceAccountCreds === 'string') {
      console.info("Service account key is double-encoded. Parsing again...");
      serviceAccountCreds = JSON.parse(serviceAccountCreds);
    }
    
    // Verify we have the required fields
    if (!serviceAccountCreds.client_email || !serviceAccountCreds.private_key) {
      throw new Error("Missing required fields in service account credentials");
    }
    
    console.info("Service account key loaded from environment variable successfully");
    return serviceAccountCreds;
  } catch (error) {
    const typedError = error as Error;
    console.error("Error getting service account credentials:", typedError);
    
    // Last resort: Try to use regex to extract required fields
    try {
      console.info("Attempting to extract service account fields with regex...");
      const rawText = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY") || "{}";
      const emailMatch = rawText.match(/"client_email"\s*:\s*"([^"]+)"/);
      const keyMatch = rawText.match(/"private_key"\s*:\s*"([^"]+)"/);
      
      if (emailMatch && keyMatch) {
        let privateKey = keyMatch[1].replace(/\\n/g, "\n");
        // Handle potential double escaping
        privateKey = privateKey.replace(/\\\\n/g, "\\n");
        
        serviceAccountCreds = {
          client_email: emailMatch[1],
          private_key: privateKey
        };
        
        console.info("Service account fields extracted successfully with regex");
        return serviceAccountCreds;
      } else {
        throw new Error("Could not extract client_email and private_key");
      }
    } catch (regexError) {
      const typedRegexError = regexError as Error;
      console.error("Regex extraction failed:", typedRegexError);
      throw new Error(`Cannot parse service account credentials: ${typedError.message}`);
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    // Rate limiting check
    const now = Date.now();
    const ipData = ipRequestMap.get(clientIp) || {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };

    if (now > ipData.resetTime) {
      // Reset window has passed, reset counter
      ipData.count = 1;
      ipData.resetTime = now + RATE_LIMIT_WINDOW_MS;
    } else {
      // Increment counter
      ipData.count++;
    }

    ipRequestMap.set(clientIp, ipData);

    if (ipData.count > RATE_LIMIT_NUM) {
      return new Response(
        JSON.stringify({ error: "Too many requests, please try again later" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate request format and authorization
    const validation = await validateRequest(req);
    if (!validation.success) {
      return validation.response as Response;
    }

    // Parse the request body
    const { sheetId, tabName, values, append = false } = await req.json();

    // Validate required parameters
    if (!sheetId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: sheetId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!tabName) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: tabName" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!values || !Array.isArray(values)) {
      return new Response(
        JSON.stringify({
          error: "Missing or invalid parameter: values should be an array",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get service account credentials using the helper function
    const serviceAccountCreds = await getServiceAccountCreds();
    console.info("Successfully retrieved service account credentials");
    console.info("Service account client_email:", serviceAccountCreds.client_email);
    console.info("Service account private_key length:", serviceAccountCreds.private_key.length);

    // Initialize the Google Sheets document
    console.info("Initializing Google Spreadsheet...");
    const doc = new GoogleSpreadsheet(sheetId) as GoogleSpreadsheetType;
    
    // Initialize auth with the service account
    console.info("Authenticating with service account...");
    await doc.useServiceAccountAuth({
      client_email: serviceAccountCreds.client_email,
      private_key: serviceAccountCreds.private_key,
    });
    
    console.info("Loading spreadsheet info...");
    await doc.loadInfo();
    console.info("Spreadsheet loaded successfully:", doc.title);

    // Access the specified worksheet (tab)
    let sheet: GoogleSpreadsheetWorksheet;
    try {
      sheet = doc.sheetsByTitle[tabName];
      if (!sheet) {
        // If sheet doesn't exist and we're in append mode, create a new sheet
        if (append) {
          sheet = await doc.addSheet({ title: tabName });
        } else {
          throw new Error(`Sheet "${tabName}" not found`);
        }
      }
    } catch (error) {
      const typedError = error as Error;
      const errorMessage = typedError.message;
      return new Response(
        JSON.stringify({ error: `Error accessing sheet: ${errorMessage}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update or append values
    try {
      if (append) {
        // Append rows to the sheet
        await sheet.addRows(values);
      } else {
        // Update cells in the sheet
        await sheet.loadCells();

        // Assuming values is an array of arrays (matrix) with [row, col, value] format
        for (const [row, col, value] of values) {
          const cell = sheet.getCell(row, col);
          cell.value = value;
        }

        await sheet.saveUpdatedCells();
      }
    } catch (error) {
      // Notify admin about error via Slack
      const typedError = error as Error;
      const errorMessage = typedError.message;
      const slackMessage = `Error updating Google Sheet: ${errorMessage}`;

      // Use our helper function for EdgeRuntime waitUntil
      await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

      return new Response(JSON.stringify({ error: slackMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: append
          ? "Data appended successfully"
          : "Sheet updated successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // Notify admin about error via Slack
    const typedError = error as Error;
    const errorMessage = typedError.message;
    const slackMessage = `Unexpected error in update-colorworks-google-sheet function: ${errorMessage}`;

    // Use our helper function for EdgeRuntime waitUntil
    await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

    return new Response(JSON.stringify({ error: slackMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
