import { corsHeaders } from "./cors.ts";

type ValidationResult = {
  success: boolean;
  response?: Response;
};

export const validateRequest = async (
  req: Request
): Promise<ValidationResult> => {
  // Validate request content type
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Content-Type must be application/json" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Validate HTTP method
  if (req.method !== "POST") {
    return {
      success: false,
      response: new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  // Verify authentication
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Invalid authorization format" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  const token = parts[1];

  // Verify token against environment variable for API key
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!apiKey || token !== apiKey) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: "Invalid authorization token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      ),
    };
  }

  return { success: true };
};
