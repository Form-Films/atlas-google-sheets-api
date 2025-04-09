import { corsHeaders } from "../_shared/cors.ts";
import { validateRequest } from "../_shared/validate-request.ts";
import { notifySlack } from "../_shared/notify-slack.ts";

// Define local types to work around TypeScript import issues
// These are simplified versions of the actual types, containing just what we need

// Define a type for row data
type SheetRowData = Record<string, string | number | boolean | null>;

type GoogleSpreadsheetWorksheet = {
  addRows: (rows: SheetRowData[]) => Promise<SheetRowData[]>;
  loadCells: () => Promise<void>;
  getCell: (row: number, col: number) => { value: unknown };
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
async function useEdgeRuntimeWaitUntil(promise: Promise<unknown>): Promise<void> {
  // Check if EdgeRuntime exists with typeof to avoid reference errors
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && 'waitUntil' in EdgeRuntime) {
    // @ts-ignore - We've checked that it exists and has waitUntil
    EdgeRuntime.waitUntil(promise);
  } else {
    // If EdgeRuntime is not available, just await the promise
    await promise;
  }
}

// Define a type for service account credentials
type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
};

/**
 * Helper function to get service account credentials from various sources
 * Prioritizes:
 * 1. Local file (for development)
 * 2. Environment variable (for production)
 */
async function getServiceAccountCreds(): Promise<ServiceAccountCredentials> {
  try {
    // Skip local file reading in production mode to avoid errors
    
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
        
        const credentials = JSON.parse(jsonStr) as ServiceAccountCredentials;
        
        // Verify we have the required fields
        if (credentials.client_email && credentials.private_key) {
          console.info("Service account key decoded from base64 successfully");
          return credentials;
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
    let credentials = JSON.parse(rawServiceAccountKey) as ServiceAccountCredentials;
    
    // If result is a string, we have double encoding
    if (typeof credentials === 'string') {
      console.info("Service account key is double-encoded. Parsing again...");
      credentials = JSON.parse(credentials) as ServiceAccountCredentials;
    }
    
    // Verify we have the required fields
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Missing required fields in service account credentials");
    }
    
    console.info("Service account key loaded from environment variable successfully");
    return credentials;
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
        
        const credentials: ServiceAccountCredentials = {
          client_email: emailMatch[1],
          private_key: privateKey
        };
        
        console.info("Service account fields extracted successfully with regex");
        return credentials;
      }
      throw new Error("Could not extract client_email and private_key");
    } catch (regexError) {
      const typedRegexError = regexError as Error;
      console.error("Regex extraction failed:", typedRegexError);
      throw new Error(`Cannot parse service account credentials: ${typedError.message}`);
    }
  }
}

// Define types for different data types
type BulkAssessmentData = {
  dataType: 'bulk-assessment';
  name: string;
  email: string;
  phoneNumber: string;
  numberOfAssessments: number;
};

// Match the frontend payload structure
type LiveEventData = {
  dataType: 'live-event';
  name: string;
  email: string;
  phoneNumber: string;
  jobTitle: string;
  organizationName: string;
  websiteUrl: string;
  estimatedAttendees: number;
  desiredContentType?: string;
  desiredDuration?: string;
  desiredFormats?: string[];
  specialEventInfo?: {
    type: string;
    eventTypes: string[];
    userDefinedEventType?: string;
  };
  locationInfo?: {
    type: string;
    city?: string;
    state?: string;
    locationName?: string;
  };
  budget?: number;
  eventDate?: string | { startDate: string; endDate: string };
  interestedInBulkAssessments?: boolean;
  referralInfo?: {
    source: string;
    moreInfo: string;
  };
  [key: string]: unknown;
};

interface RequestData {
  data: {
    dataType: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Add detailed request logging
    console.info("Request received:", {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries([...req.headers.entries()])
    });

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
      console.warn(`Rate limit exceeded for IP: ${clientIp}`);
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
      console.error("Request validation failed");
      return validation.response as Response;
    }

    // Clone the request to read the body multiple times
    const clonedReq = req.clone();
    
    // Log the raw request body for debugging
    try {
      const rawBody = await clonedReq.text();
      console.info("Raw request body:", rawBody);
    } catch (e: unknown) {
      const error = e as Error;
      console.warn("Failed to log raw body:", error.message);
    }

    // Parse the request body
    let requestBody: RequestData;
    try {
      requestBody = await req.json();
      console.info("Parsed request body:", JSON.stringify(requestBody, null, 2));
    } catch (parseError) {
      console.error("Failed to parse request body as JSON:", (parseError as Error).message);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body",
          details: (parseError as Error).message
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if we have a data property
    if (!requestBody.data) {
      console.error("Missing required property: data");
      return new Response(
        JSON.stringify({ 
          error: "Missing required property: data",
          receivedParams: Object.keys(requestBody)
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Process based on data type
    // Get Google Sheet configuration from environment variables
    const colorworksSheetId = Deno.env.get("COLORWORKS_GOOGLE_SHEET_ID");
    if (!colorworksSheetId) {
      console.error("COLORWORKS_GOOGLE_SHEET_ID environment variable not set");
      return new Response(
        JSON.stringify({ 
          error: "Server configuration error: Missing sheet ID"
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    const sheetId: string = colorworksSheetId;
    let tabName: string;
    let values: SheetRowData[];
    const append = true; // Always append for these data types

    // Process data based on dataType
    const data = requestBody.data;
    console.info(`Processing data with type: ${data.dataType}`);
    
    if (data.dataType === 'bulk-assessment') {
      const bulkData = data as BulkAssessmentData;
      
      // Validate required fields
      const requiredFields = ['name', 'email', 'phoneNumber', 'numberOfAssessments'];
      const missingFields = requiredFields.filter(field => !(field in bulkData));
      
      if (missingFields.length > 0) {
        console.error(`Missing required fields for bulk-assessment: ${missingFields.join(', ')}`);
        return new Response(
          JSON.stringify({ 
            error: `Missing required fields: ${missingFields.join(', ')}` 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }

      // Set the tab name for bulk assessments
      tabName = "Bulk Assessments";
      
      // Format the data for the sheet
      const timestamp = new Date().toISOString();
      // Log the raw data for debugging
      console.info("Raw data being processed:", {
        name: bulkData.name,
        email: bulkData.email,
        phone: bulkData.phoneNumber,
        assessments: bulkData.numberOfAssessments
      });
      
      // Create row with exact header names that match the Google Sheet
      values = [{
        "Date": timestamp.split('T')[0], // Just the date part YYYY-MM-DD
        "Name": bulkData.name,
        "Email": bulkData.email,
        "Phone Number": bulkData.phoneNumber, // Try with space
        "Number of Assessments": bulkData.numberOfAssessments, // Changed back to exact header
        "Submission Date": timestamp // Full ISO timestamp
      }];
      
      // Log the formatted row for debugging
      console.info("Formatted row for sheet:", values[0]);
      
    } else if (data.dataType === 'live-event') {
      const eventData = data as LiveEventData;
      
      // Validate required fields for live events
      const requiredFields = ['name', 'email', 'phoneNumber', 'estimatedAttendees'];
      const missingFields = requiredFields.filter(field => !(field in eventData));
      
      if (missingFields.length > 0) {
        console.error(`Missing required fields for live-event: ${missingFields.join(', ')}`);
        return new Response(
          JSON.stringify({ 
            error: `Missing required fields: ${missingFields.join(', ')}` 
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
      
      // Handle live event data
      tabName = "Live Events";
      
      // Log the raw data for debugging
      console.info("Raw live event data being processed:", JSON.stringify(eventData, null, 2));
      
      // Format event date
      let formattedEventDate = "";
      if (eventData.eventDate) {
        if (typeof eventData.eventDate === 'string') {
          formattedEventDate = eventData.eventDate;
        } else {
          formattedEventDate = `${eventData.eventDate.startDate} to ${eventData.eventDate.endDate}`;
        }
      }
      
      // Format event formats
      const eventFormats = Array.isArray(eventData.desiredFormats) 
        ? eventData.desiredFormats.join(", ") 
        : "";
      
      // Format event types
      const eventTypes = eventData.specialEventInfo?.eventTypes?.join(", ") || "";
      
      // Format location information
      const locationType = eventData.locationInfo?.type || "";
      const city = eventData.locationInfo?.city || "";
      const state = eventData.locationInfo?.state || "";
      const locationName = eventData.locationInfo?.locationName || "";
      
      // Format referral information
      const referralSource = eventData.referralInfo?.source || "";
      const referralInfo = eventData.referralInfo?.moreInfo || "";
      
      const timestamp = new Date().toISOString();
      
      // Create row with exact header names that match the Google Sheet
      values = [{
        "Name": eventData.name,
        "Email": eventData.email,
        "Phone Number": eventData.phoneNumber,
        "Job Title": eventData.jobTitle || "",
        "Organization": eventData.organizationName || "",
        "Website": eventData.websiteUrl || "",
        "Estimated Attendees": eventData.estimatedAttendees,
        "Content Type": eventData.desiredContentType || "",
        "Duration": eventData.desiredDuration || "",
        "Event Formats": eventFormats,
        "Event Group Type": eventData.specialEventInfo?.type || "",
        "Event Types": eventTypes,
        "Custom Event Type": eventData.specialEventInfo?.userDefinedEventType || "",
        "Location Type": locationType,
        "City": city,
        "State": state,
        "Location Name": locationName,
        "Budget": eventData.budget?.toString() || "",
        "Event Date": formattedEventDate,
        "Interested In Bulk Assessments": eventData.interestedInBulkAssessments === true ? "Yes" : "No",
        "Referral Source": referralSource,
        "Referral Info": referralInfo,
        "Submission Date": timestamp
      }];
      
      // Log the formatted row for debugging
      console.info("Formatted row for live event:", JSON.stringify(values[0], null, 2));
    } else {
      console.error(`Unknown data type: ${data.dataType}`);
      return new Response(
        JSON.stringify({ 
          error: `Unknown data type: ${data.dataType}` 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.info("Processed data:", {
      sheetId,
      tabName,
      values: JSON.stringify(values)
    });

    // Get service account credentials using the helper function
    console.info("Attempting to get service account credentials...");
    const serviceAccountCreds = await getServiceAccountCreds();
    console.info("Successfully retrieved service account credentials");
    console.info("Service account client_email:", serviceAccountCreds.client_email);
    console.info("Service account private_key length:", serviceAccountCreds.private_key.length);

    // Initialize the Google Sheets document
    console.info(`Initializing Google Spreadsheet with ID: ${sheetId}...`);
    const doc = new GoogleSpreadsheet(sheetId) as GoogleSpreadsheetType;
    
    // Initialize auth with the service account
    console.info("Authenticating with service account...");
    try {
      await doc.useServiceAccountAuth({
        client_email: serviceAccountCreds.client_email,
        private_key: serviceAccountCreds.private_key,
      });
      console.info("Authentication successful");
    } catch (authError) {
      console.error("Authentication failed:", (authError as Error).message);
      const slackMessage = `Google Sheets authentication error: ${(authError as Error).message}`;
      await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));
      
      return new Response(
        JSON.stringify({ 
          error: "Authentication with Google Sheets failed",
          details: (authError as Error).message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    console.info("Loading spreadsheet info...");
    try {
      await doc.loadInfo();
      console.info("Spreadsheet loaded successfully:", doc.title);
    } catch (loadError) {
      console.error("Failed to load spreadsheet info:", (loadError as Error).message);
      const slackMessage = `Failed to load Google Sheet: ${(loadError as Error).message}`;
      await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));
      
      return new Response(
        JSON.stringify({ 
          error: "Failed to load spreadsheet",
          details: (loadError as Error).message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Access the specified worksheet (tab)
    let sheet: GoogleSpreadsheetWorksheet;
    try {
      console.info(`Looking for tab: "${tabName}" in spreadsheet`);
      sheet = doc.sheetsByTitle[tabName];
      if (!sheet) {
        console.info(`Tab "${tabName}" not found`);
        
        // If sheet doesn't exist and we're in append mode, create a new sheet
        if (append) {
          console.info(`Creating new tab "${tabName}" in append mode`);
          sheet = await doc.addSheet({ title: tabName });
          console.info(`New tab "${tabName}" created successfully`);
        } else {
          console.error(`Tab "${tabName}" not found and not in append mode`);
          throw new Error(`Sheet "${tabName}" not found`);
        }
      } else {
        console.info(`Tab "${tabName}" found successfully`);
      }
    } catch (error) {
      const typedError = error as Error;
      const errorMessage = typedError.message;
      console.error(`Error accessing sheet: ${errorMessage}`);
      
      return new Response(
        JSON.stringify({ 
          error: `Error accessing sheet: ${errorMessage}`,
          availableTabs: Object.keys(doc.sheetsByTitle || {})
        }),
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
        console.info(`Appending ${values.length} rows to sheet...`);
        console.info("Sample data (first row):", JSON.stringify(values[0]));
        // Cast values to the expected type
        await sheet.addRows(values);
        console.info("Rows appended successfully");
      } else {
        // Update cells in the sheet
        console.info(`Updating ${values.length} cells in sheet...`);
        console.info("Sample data (first update):", JSON.stringify(values[0]));
        await sheet.loadCells();

        // Assuming values is an array of arrays (matrix) with [row, col, value] format
        // Check if values is iterable before proceeding
        if (!Array.isArray(values)) {
          throw new Error("Values must be an array for cell updates");
        }
        
        for (const item of values) {
          if (!Array.isArray(item) || item.length !== 3) {
            throw new Error("Each value must be an array with [row, col, value] format");
          }
          const row = item[0] as number;
          const col = item[1] as number;
          const value = item[2];
          console.info(`Setting cell [${row}, ${col}] to value: ${value}`);
          const cell = sheet.getCell(row, col);
          cell.value = value;
        }

        await sheet.saveUpdatedCells();
        console.info("Cells updated successfully");
      }
    } catch (error) {
      // Notify admin about error via Slack
      const typedError = error as Error;
      const errorMessage = typedError.message;
      console.error(`Error updating sheet: ${errorMessage}`, typedError.stack);
      const slackMessage = `Error updating Google Sheet: ${errorMessage}`;

      // Use our helper function for EdgeRuntime waitUntil
      await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

      return new Response(
        JSON.stringify({ 
          error: `Error updating sheet: ${errorMessage}`,
          details: typedError.stack
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response
    console.info("Operation completed successfully");
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
    console.error("Unexpected error:", errorMessage, typedError.stack);
    const slackMessage = `Unexpected error in update-colorworks-google-sheet function: ${errorMessage}`;

    // Use our helper function for EdgeRuntime waitUntil
    await useEdgeRuntimeWaitUntil(notifySlack(slackMessage));

    return new Response(
      JSON.stringify({ 
        error: `Unexpected error: ${errorMessage}`, 
        details: typedError.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
