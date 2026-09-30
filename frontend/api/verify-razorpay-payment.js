import crypto from "crypto";
import { getSupabaseAdmin } from "./_lib/clients.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: "Payment system is not configured yet." });
  }

  try {
    const { transactionId, razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};

    if (!transactionId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const verified = expectedSignature === razorpay_signature;

    if (verified) {
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "paid",
          gateway_payment_id: razorpay_payment_id,
          gateway_signature: razorpay_signature,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId);
    } else {
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: "Signature verification failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId);
    }

    return res.status(200).json({ verified });
  } catch (err) {
    console.error("verify-razorpay-payment error", err);
    return res.status(500).json({ error: "Verification failed" });
  }
}