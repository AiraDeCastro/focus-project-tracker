import { describe, expect, it, vi } from "vitest";
import { createResendSender, type EmailMessage } from "./resend";

const message: EmailMessage = {
  from: "Focus Trail <onboarding@resend.dev>",
  to: "me@example.com",
  subject: "Today in recipe-box",
  text: "plain",
  html: "<p>html</p>",
};

function reply(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(body), { status }) as Response,
  );
}

describe("createResendSender", () => {
  it("posts the message to Resend with the key in the Authorization header", async () => {
    const fetchMock = reply({ id: "email_123" });
    const result = await createResendSender("re_secret", { fetch: fetchMock })(message);

    expect(result).toEqual({ ok: true, id: "email_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_secret");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: message.from,
      to: ["me@example.com"],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  });

  it("reports Resend's error message, and never includes the key", async () => {
    const fetchMock = reply({ message: "The from address is not verified." }, 403);
    const result = await createResendSender("re_secret", { fetch: fetchMock })(message);

    expect(result).toEqual({
      ok: false,
      error: "Resend answered 403. The from address is not verified.",
    });
    expect(JSON.stringify(result)).not.toContain("re_secret");
  });

  it("handles an answer that is not JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("Bad gateway", { status: 502 }));
    const result = await createResendSender("k", { fetch: fetchMock })(message);
    expect(result).toEqual({ ok: false, error: "Resend answered 502." });
  });

  it("treats a success answer with no id as a failure", async () => {
    const result = await createResendSender("k", { fetch: reply({}) })(message);
    expect(result.ok).toBe(false);
  });

  it("reports a network failure without leaking details", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("getaddrinfo ENOTFOUND re_secret");
    });
    const result = await createResendSender("re_secret", { fetch: fetchMock })(message);
    expect(result).toEqual({ ok: false, error: "Could not reach Resend." });
  });
});
