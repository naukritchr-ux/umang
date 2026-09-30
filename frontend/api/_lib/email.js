const NOTIFY_FROM = process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev";

export async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `UMANG <${NOTIFY_FROM}>`,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }
  return res.json();
}

export function buildEmail(event, data) {
  switch (event) {
    case "call_scheduled":
      return {
        subject: "Your call with UMANG has been scheduled",
        html: `<p>Hi ${data.name || "there"},</p>
               <p>Your call has been scheduled for <strong>${data.scheduledAt}</strong>.</p>
               <p>Our team will call you on ${data.mobile || "your registered number"}.</p>`,
      };
    case "callback_requested":
      return {
        subject: "Callback request received — UMANG",
        html: `<p>Hi ${data.name || "there"},</p>
               <p>We've noted your callback request${data.scheduledAt ? ` for <strong>${data.scheduledAt}</strong>` : ""}. Our team will reach out soon.</p>`,
      };
    case "document_approved":
      return {
        subject: "Document approved — UMANG",
        html: `<p>Your document <strong>${data.docType}</strong> has been approved.</p>
               <p>You can check your claim status anytime from your dashboard.</p>`,
      };
    case "document_rejected":
      return {
        subject: "Action needed: Document rejected — UMANG",
        html: `<p>Your document <strong>${data.docType}</strong> was rejected.</p>
               <p><strong>Reason:</strong> ${data.reason}</p>
               <p>Please log in and re-upload the correct document to continue your claim.</p>`,
      };
    case "claim_recovered":
      return {
        subject: "Good news — your money has been recovered! 🎉",
        html: `<p>Hi ${data.name || "there"},</p>
               <p>We're happy to let you know that <strong>₹${data.recoveredAmount}</strong> has been recovered for your claim.</p>
               <p>A success fee of <strong>₹${data.successFeeAmount}</strong> (10%) is now due as per your agreement. Please log in to complete the payment.</p>`,
      };
    case "claim_status_changed":
      return {
        subject: `Your claim status: ${data.newStatus}`,
        html: `<p>Hi ${data.name || "there"},</p>
               <p>Your claim status has been updated to <strong>${data.newStatus}</strong>.</p>
               ${data.note ? `<p>${data.note}</p>` : ""}`,
      };
    default:
      return {
        subject: data.subject || "Update from UMANG",
        html: data.html || `<p>${data.message || "You have a new update."}</p>`,
      };
  }
}