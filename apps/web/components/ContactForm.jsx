"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "./ui";

/**
 * Contact form. Posts to the API through the site's own origin.
 *
 * The `website` input is a honeypot: it is hidden from people and
 * left empty by them, so anything that fills it is automated. The
 * API accepts those silently rather than returning an error that
 * would tell a bot which field caught it.
 */
export function ContactForm({ email }) {
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  async function onSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(
      [...form.entries()].filter(([, v]) => String(v).trim() !== "")
    );

    try {
      const res = await fetch("/api/public/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 400 && Array.isArray(body?.error?.details)) {
          const errs = {};
          for (const d of body.error.details) errs[d.field] ??= d.message;
          setFieldErrors(errs);
          setMessage("Please check the highlighted fields.");
        } else if (res.status === 429) {
          setMessage("Too many messages from here just now. Please try again later.");
        } else {
          setMessage(body?.error?.message ?? "Something went wrong. Please email us instead.");
        }
        setStatus("error");
        return;
      }

      setStatus("sent");
      setMessage(body?.message ?? "Thanks, we will be in touch.");
      e.target.reset();
    } catch {
      setStatus("error");
      setMessage("Could not reach us just now. Please email us instead.");
    }
  }

  if (status === "sent") {
    return (
      <div className="surface-card p-7 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent-ice">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <p className="t-h3 mt-4">Message sent</p>
        <p className="t-body mt-2 text-body">{message}</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-5 text-sm text-accent-ice underline-offset-4 hover:underline"
        >
          Send another
        </button>
      </div>
    );
  }

  const err = (name) =>
    fieldErrors[name] ? (
      <span className="mt-1 block text-xs text-clay">{fieldErrors[name]}</span>
    ) : null;

  const input =
    "w-full rounded-inner border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink transition-colors placeholder:text-faint hover:border-line-soft focus:border-accent focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="surface-card p-6 text-left sm:p-7" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="t-label mb-1.5 block text-faint">Your name</span>
          <input name="name" required maxLength={120} className={input} placeholder="Dr Meera Krishnan" />
          {err("name")}
        </label>

        <label className="block">
          <span className="t-label mb-1.5 block text-faint">Email</span>
          <input name="email" type="email" required maxLength={200} className={input} placeholder="you@college.edu" />
          {err("email")}
        </label>

        <label className="block">
          <span className="t-label mb-1.5 block text-faint">Institution</span>
          <input name="organisation" maxLength={160} className={input} placeholder="Engineering college" />
          {err("organisation")}
        </label>

        <label className="block">
          <span className="t-label mb-1.5 block text-faint">Phone (optional)</span>
          <input name="phone" maxLength={40} className={input} placeholder="+91 …" />
          {err("phone")}
        </label>
      </div>

      <label className="mt-4 block">
        <span className="t-label mb-1.5 block text-faint">How can we help?</span>
        <textarea
          name="message"
          required
          rows={4}
          minLength={10}
          maxLength={5000}
          className={`${input} resize-y leading-relaxed`}
          placeholder="Tell us about your batch size, the track you have in mind and your semester calendar."
        />
        {err("message")}
      </label>

      {/* Honeypot. Hidden from people, not from bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {status === "error" && message && (
        <p role="alert" className="mt-4 rounded-inner border border-clay/40 bg-clay/10 px-3 py-2 text-sm text-clay">
          {message}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button
          as="button"
          type="submit"
          disabled={status === "sending"}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Send message"}
        </Button>
        <p className="t-body text-faint">
          Or email{" "}
          <a href={`mailto:${email}`} className="text-accent-ice underline-offset-4 hover:underline">
            {email}
          </a>
        </p>
      </div>
    </form>
  );
}
