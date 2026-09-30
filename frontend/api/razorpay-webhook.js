import crypto from "crypto";
import { getSupabaseAdmin } from "./_lib/clients.js";

// Razorpay's signature is computed over the RAW body, so turn off Vercel's body parser.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin || !process.env.RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Webhook is not configured yet." });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expected !== signature) {
    console.warn("Razorpay webhook: signature mismatch — rejecting");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString());

  try {
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "paid",
          gateway_payment_id: payment.id,
          updated_at: new Date().toISOString(),
        })
        .eq("gateway_order_id", payment.order_id);
    } else if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;
      const { data: existing } = await supabaseAdmin
        .from("payment_transactions")
        .select("id, attempt_count")
        .eq("gateway_order_id", payment.order_id)
        .single();

      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: payment.error_description || "Payment failed at gateway",
          attempt_count: (existing?.attempt_count || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("gateway_order_id", payment.order_id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("razorpay-webhook processing error", err);
    return res.status(200).json({ received: true, warning: "processing error logged" });
  }
}