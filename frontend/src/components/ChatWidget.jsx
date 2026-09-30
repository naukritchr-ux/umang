import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Minus,
  Search,
  FileText,
  ShieldCheck,
  PhoneCall,
  ArrowRight,
  Lock,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_ERROR_REPLY =
  "Sorry, I couldn't process that right now. Please try again, or request a call below.";

// Change this to your deployed backend URL when you go live
// Same-origin API route (works on Vercel and locally via the Vite proxy)
const BACKEND_URL = "/api/chat";

async function askBot(message) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    return data.reply || DEFAULT_ERROR_REPLY;
  } catch (err) {
    console.error("Chat error:", err);
    return DEFAULT_ERROR_REPLY;
  }
}

const QUICK_ACTIONS = [
  { key: "search", icon: Search, title: "Search my name" },
  { key: "how", icon: FileText, title: "How does it work?" },
  { key: "fees", icon: ShieldCheck, title: "Claim assistance & fees" },
  { key: "agent", icon: PhoneCall, title: "Talk to an AI agent" },
];

const SUGGESTED_QUESTIONS = [
  "What is UMANG?",
  "How much does it cost?",
  "What documents do I need?",
  "How do I claim my money?",
  "Check my claim status",
];

const WELCOME_TEXT =
  "Hello! 👋\nI'm UMANG Assistant.\n\nI can help you search for unclaimed assets, understand the claim process, and guide you through your next steps.\n\nWhat would you like to do today?";

const HOW_IT_WORKS_TEXT =
  "Here's how UMANG works:\n\n1. Search — enter your name, free of charge.\n2. Match Found — we show possible matches from banks, mutual funds, insurers and IEPF.\n3. Claim Assistance — our team helps you with the process for a one-time ₹299 fee.\n4. Recovery — if your money is recovered, a success fee applies as per the agreement you accept.";

const FEES_TEXT =
  "Searching for records on UMANG is free.\n\nIf you choose Claim Assistance, a one-time ₹299 assistance fee applies. This covers guidance through the claim process and document/process assistance.\n\nRecovery is not guaranteed.\n\nIf you later proceed with recovery and accept the applicable success-fee agreement, the success fee is calculated according to that agreement.";

// very light local keyword handling before falling back to the backend
function localReply(rawText) {
  const text = rawText.toLowerCase();

  if (text.includes("what is umang")) {
    return "UMANG helps you search for unclaimed money and assets — from banks, mutual funds, insurers and IEPF — and guides you through claiming it back.";
  }
  if (text.includes("cost") || text.includes("fee") || text.includes("price") || text.includes("₹299") || text.includes("299")) {
    return FEES_TEXT;
  }
  if (text.includes("document")) {
    return "You'll typically need ID proof, address proof, and bank account details to file a claim. Exact documents depend on the type of asset and will be confirmed during claim assistance.";
  }
  if (text.includes("claim my money") || text.includes("how do i claim") || text.includes("how to claim")) {
    return HOW_IT_WORKS_TEXT;
  }
  if (text.includes("claim status") || text.includes("my claim")) {
    return "__CLAIM_STATUS__";
  }
  if (text.includes("how does it work") || text.includes("how it works")) {
    return HOW_IT_WORKS_TEXT;
  }
  if (text.includes("privacy") || text.includes("data") || text.includes("secure")) {
    return "Your information is handled with care and in line with DPDP requirements. We never share your data with unrelated third parties.";
  }
  return null;
}

const STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under Review",
  documents_pending: "Documents Required",
  filed_with_authority: "Filed",
  recovered: "Recovered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function ChatWidget({ setView }) {
  const [open, setOpen] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // AI-agent call request mini flow
  const [agentStep, setAgentStep] = useState(null); // null | 'confirm' | 'ask_name' | 'ask_mobile' | 'confirm_mobile'
  const [agentDraft, setAgentDraft] = useState({ name: "", mobile: "" });

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, loading]);

  useEffect(() => {
    if (open && !hasOpenedOnce) {
      setHasOpenedOnce(true);
      setMessages([
        { from: "bot", text: WELCOME_TEXT, showActions: true },
      ]);
    }
  }, [open, hasOpenedOnce]);

  const pushBot = (text, extra = {}) => {
    setMessages((prev) => [...prev, { from: "bot", text, ...extra }]);
  };

  const pushUser = (text) => {
    setMessages((prev) => [...prev, { from: "user", text }]);
  };

  const handleQuickAction = async (key) => {
    if (key === "search") {
      pushUser("Search my name");
      pushBot("Taking you to the search page…");
      setTimeout(() => {
        setView?.("search");
        setOpen(false);
      }, 400);
      return;
    }
    if (key === "how") {
      pushUser("How does it work?");
      pushBot(HOW_IT_WORKS_TEXT, { showFollowUps: ["search", "fees", "agent"] });
      return;
    }
    if (key === "fees") {
      pushUser("Claim assistance & fees");
      pushBot(FEES_TEXT, { showFollowUps: ["search", "agent"] });
      return;
    }
    if (key === "agent") {
      pushUser("Talk to an AI agent");
      pushBot("Would you like to speak with our AI phone assistant?", {
        showAgentConfirm: true,
      });
      setAgentStep("confirm");
      return;
    }
  };

  const startAgentFlow = () => {
    pushUser("Request a Call");
    pushBot("Sure — this will be handled by our AI phone assistant. What's your name?");
    setAgentStep("ask_name");
  };

  const cancelAgentFlow = () => {
    pushUser("Not now");
    pushBot("No problem! Let me know if you need anything else.", {
      showFollowUps: ["search", "how", "fees"],
    });
    setAgentStep(null);
    setAgentDraft({ name: "", mobile: "" });
  };

  const submitCallRequest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("call_requests")
        .insert({
          full_name: agentDraft.name.trim(),
          mobile_number: agentDraft.mobile.trim(),
          status: "requested",
          source: "chatbot",
        })
        .select()
        .single();

      if (error) throw error;

      // remember locally so App.jsx's "called" banner logic can pick it up
      try {
        const stored = JSON.parse(localStorage.getItem("umang_call_request_ids") || "[]");
        stored.push({ id: data.id });
        localStorage.setItem("umang_call_request_ids", JSON.stringify(stored));
      } catch {
        // ignore
      }

      pushBot(
        "Your AI call request has been submitted. You will receive a call shortly from our AI assistant — not a human representative.",
        { showFollowUps: ["search", "fees"] }
      );
    } catch (err) {
      console.error("Call request failed:", err);
      pushBot(DEFAULT_ERROR_REPLY);
    } finally {
      setLoading(false);
      setAgentStep(null);
      setAgentDraft({ name: "", mobile: "" });
    }
  };

  const handleClaimStatusRequest = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        pushBot("Please log in to check your claim status, or share your claim reference if you have one.");
        return;
      }

      const { data, error } = await supabase
        .from("claim_requests")
        .select("status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        pushBot("I couldn't find an active claim linked to your account yet. If you've requested a call, our team will reach out soon.");
        return;
      }

      const label = STATUS_LABELS[data.status] || data.status;
      pushBot(`Your most recent claim status is: **${label}**.`);
    } catch (err) {
      console.error("Claim status check failed:", err);
      pushBot(DEFAULT_ERROR_REPLY);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    pushUser(text);
    setInput("");

    // If we're in the middle of the agent (call-request) flow, handle locally
    if (agentStep === "ask_name") {
      setAgentDraft((d) => ({ ...d, name: text }));
      pushBot(`Thanks, ${text}. What's your mobile number?`);
      setAgentStep("ask_mobile");
      return;
    }
    if (agentStep === "ask_mobile") {
      setAgentDraft((d) => ({ ...d, mobile: text }));
      pushBot(`Just to confirm — should we call you on ${text}?`, {
        showMobileConfirm: true,
      });
      setAgentStep("confirm_mobile");
      return;
    }

    setLoading(true);

    const local = localReply(text);
    if (local === "__CLAIM_STATUS__") {
      await handleClaimStatusRequest();
      setLoading(false);
      return;
    }
    if (local) {
      pushBot(local, { showFollowUps: ["search", "fees", "agent"] });
      setLoading(false);
      return;
    }

    const reply = await askBot(text);
    pushBot(reply);
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  return (
    <div className="fixed bottom-5 right-5 z-[1000] flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[94vw] max-w-[480px] h-[680px] max-h-[85vh] bg-white rounded-[20px] shadow-2xl border border-emerald-100 flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
          {/* Header */}
          <div className="bg-emerald-950 text-white px-4 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">UMANG Assistant</p>
              <p className="text-[11px] text-emerald-200/80 leading-tight">
                Your AI claim support partner
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-emerald-200 hover:bg-white/10 hover:text-white transition"
              aria-label="Minimize"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={() => {
                setOpen(false);
              }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-emerald-200 hover:bg-white/10 hover:text-white transition"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-emerald-50/40 to-white"
          >
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-line text-[13px] leading-5 px-3.5 py-2.5 rounded-2xl ${
                      m.from === "user"
                        ? "bg-emerald-950 text-white rounded-br-sm"
                        : "bg-white text-gray-700 border border-emerald-100 rounded-bl-sm shadow-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>

                {/* Welcome message quick actions */}
                {m.showActions && (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {QUICK_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.key}
                          onClick={() => handleQuickAction(action.key)}
                          className="flex items-center gap-3 bg-white border border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/50 rounded-xl px-3.5 py-2.5 text-left transition group"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                            <Icon size={15} className="text-emerald-700" />
                          </div>
                          <span className="flex-1 text-[13px] font-semibold text-emerald-950">
                            {action.title}
                          </span>
                          <ArrowRight
                            size={14}
                            className="text-emerald-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Follow-up quick actions after an answer */}
                {m.showFollowUps && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.showFollowUps.map((key) => {
                      const action = QUICK_ACTIONS.find((a) => a.key === key);
                      if (!action) return null;
                      return (
                        <button
                          key={key}
                          onClick={() => handleQuickAction(key)}
                          className="text-[12px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-100 transition"
                        >
                          {action.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* AI agent: initial confirm */}
                {m.showAgentConfirm && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={startAgentFlow}
                      className="text-[12px] font-bold text-white bg-emerald-950 rounded-full px-4 py-1.5 hover:bg-emerald-900 transition"
                    >
                      Request a Call
                    </button>
                    <button
                      onClick={cancelAgentFlow}
                      className="text-[12px] font-semibold text-gray-600 bg-gray-100 rounded-full px-4 py-1.5 hover:bg-gray-200 transition"
                    >
                      Not Now
                    </button>
                  </div>
                )}

                {/* AI agent: confirm mobile number before submitting */}
                {m.showMobileConfirm && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={submitCallRequest}
                      disabled={loading}
                      className="text-[12px] font-bold text-white bg-emerald-950 rounded-full px-4 py-1.5 hover:bg-emerald-900 transition disabled:opacity-50"
                    >
                      Yes, that's correct
                    </button>
                    <button
                      onClick={() => {
                        pushBot("No problem — what's the correct mobile number?");
                        setAgentStep("ask_mobile");
                      }}
                      className="text-[12px] font-semibold text-gray-600 bg-gray-100 rounded-full px-4 py-1.5 hover:bg-gray-200 transition"
                    >
                      Change number
                    </button>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-emerald-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[12px] text-gray-400 italic shadow-sm">
                  UMANG Assistant is typing…
                </div>
              </div>
            )}
          </div>

          {/* Suggested questions */}
          {!agentStep && messages.length > 0 && (
            <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5 border-t border-emerald-50">
              {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full px-2.5 py-1 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-3 border-t border-emerald-100">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 text-[13px] px-3.5 py-2.5 rounded-full border border-emerald-100 bg-emerald-50/40 focus:outline-none focus:border-emerald-400 transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-full bg-emerald-950 text-white flex items-center justify-center hover:bg-emerald-900 transition disabled:opacity-40 shrink-0"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>

          {/* Footer */}
          <div className="px-4 py-2 bg-emerald-50/60 border-t border-emerald-100 flex items-center gap-1.5 text-[10.5px] text-emerald-700/80">
            <Lock size={11} />
            <span>Your data is safe & secure · DPDP Compliant</span>
          </div>
        </div>
      )}

      {/* Floating button */}
      <div className="relative group">
        {!open && (
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap bg-emerald-950 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition pointer-events-none">
            Chat with UMANG
          </span>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-16 h-16 rounded-full bg-emerald-950 text-white flex items-center justify-center shadow-lg hover:shadow-emerald-300/50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          style={{ boxShadow: "0 4px 20px rgba(6, 78, 59, 0.35)" }}
          aria-label={open ? "Close chat" : "Open chat"}
        >
          {open ? <X size={24} /> : <Sparkles size={24} className="animate-pulse" />}
        </button>
      </div>
    </div>
  );
}