export const notifySlack = async (message: string): Promise<void> => {
  const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

  // Skip if webhook URL is not configured
  if (!slackWebhookUrl) {
    console.error("Slack webhook URL not configured, skipping notification");
    return;
  }

  try {
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `🚨 *Google Sheets API Error:* ${message}`,
      }),
    });

    if (!response.ok) {
      console.error(
        `Failed to send Slack notification: ${await response.text()}`
      );
    }
  } catch (error) {
    console.error(
      `Error sending Slack notification: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
