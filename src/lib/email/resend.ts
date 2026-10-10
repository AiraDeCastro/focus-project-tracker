export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/** Sends one email. The Resend version is below; tests pass a fake. */
export type SendEmail = (message: EmailMessage) => Promise<SendResult>;

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Sends email through Resend's HTTP API. A few lines over `fetch`, so no SDK is needed. The key is
 * only ever sent in the Authorization header; it is never put in an error message or a log.
 */
export function createResendSender(
  apiKey: string,
  options: { fetch?: typeof fetch } = {},
): SendEmail {
  const doFetch = options.fetch ?? fetch;
  return async (message) => {
    let response: Response;
    try {
      response = await doFetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
    } catch {
      return { ok: false, error: "Could not reach Resend." };
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON answer is handled below by its status.
    }
    const fields = (typeof body === "object" && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    if (response.ok && typeof fields.id === "string") return { ok: true, id: fields.id };

    const detail = typeof fields.message === "string" ? ` ${fields.message}` : "";
    return { ok: false, error: `Resend answered ${response.status}.${detail}`.trim() };
  };
}
