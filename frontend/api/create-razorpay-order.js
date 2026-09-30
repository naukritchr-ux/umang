import { getRazorpay, getSupabaseAdmin } from "./_lib/clients.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const razorpay = getRazorpay();
  const supabaseAdmin = getSupabaseAdmin();
  if (!razorpay || !supabaseAdmin) {
    return res.status(503).json({ error: "Payment system is not configured yet." });
  }

  try {
    const { claimId, paymentType, amount } = req.body || {};

    if (!claimId || !paymentType || !amount) {
      return res.status(400).json({ error: "claimId, paymentType and amount are required" });
    }
    if (!["assistance_fee", "success_fee"].includes(paymentType)) {
      return res.status(400).json({ error: "Invalid paymentType" });
    }

    const { data: claim, error: claimErr } = await supabaseAdmin
      .from("claim_requests")
      .select("id, user_id")
      .eq("id", claimId)
      .single();

    if (claimErr || !claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    const amountPaise = Math.round(Number(amount) * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `${paymentType}_${claimId}`.slice(0, 40),
      notes: { claimId, paymentType },
    });

    const { data: txn, error: txnErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        claim_id: claimId,
        user_id: claim.user_id,
        payment_type: paymentType,
        amount: amount,
        gateway: "razorpay",
        gateway_order_id: order.id,
        status: "created",
      })
      .select()
      .single();

    if (txnErr) {
      console.error("Failed to record payment_transactions row", txnErr);
      return res.status(500).json({ error: "Could not record transaction" });
    }

    return res.status(200).json({
      orderId: order.id,
      amountPaise,
      keyId: process.env.RAZORPAY_KEY_ID,
      transactionId: txn.id,
    });
  } catch (err) {
    console.error("create-razorpay-order error", err);
    return res.status(500).json({ error: "Could not create order" });
  }
}