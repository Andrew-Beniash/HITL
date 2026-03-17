import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export async function sendEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const fromAddress = process.env.SES_FROM_ADDRESS;

  if (!fromAddress) {
    // Dev / test fallback — no real email sent, never throws
    console.log("[EMAIL DEV]", { to, subject, htmlBody });
    return;
  }

  const client = new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  await client.send(
    new SendEmailCommand({
      Source: fromAddress,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: htmlBody, Charset: "UTF-8" } },
      },
    })
  );
}
