"use client";

import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "./ui";
import { contact } from "@/lib/siteConfig";

/**
 * Contact enquiry form.
 *
 * Posts to POST /api/public/enquiries, which exists and writes a row
 * the admin portal can triage. Success is reported only on a real 2xx
 * from that endpoint; anything else is shown as a failure. Nothing is
 * written to localStorage.
 *
 * `enquiryType` is sent as `subject` and `programmeOfInterest` as
 * `programme`, which are the column names on the Enquiry model.
 *
 * The `website` input is a honeypot: hidden from people, so anything
 * that fills it is automated. The API accepts those silently with a
 * 202 rather than returning an error that would tell a bot which
 * field caught it.
 */
const ENDPOINT = "/api/public/enquiries";

const ENQUIRY_TYPES = [
  "Institutional Training / College Partnership",
  "SOC Analyst Programme",
  "AI Security Programme",
  "Corporate Training",
  "Trainer / Expert Collaboration",
  "General Enquiry",
  "Other",
];

const PROGRAMMES = [
  "SOC Analyst",
  "AI Security Engineer",
  "Both",
  "Not sure yet",
];

const initial = {
  name: "",
  email: "",
  phone: "",
  organisation: "",
  designation: "",
  subject: "",
  programme: "",
  message: "",
};

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const digits = (v) => v.replace(/\D/g, "");

function validate(v) {
  const e = {};
  if (!v.name.trim()) e.name = "Enter your full name.";
  else if (v.name.trim().length < 2) e.name = "Enter your full name.";

  if (!v.email.trim()) e.email = "Enter your email address.";
  else if (!isEmail(v.email.trim())) e.email = "Enter a valid email address.";

  // Optional, but if given it has to look like a phone number.
  if (v.phone.trim() && digits(v.phone).length < 7)
    e.phone = "Enter a valid phone number, or leave this blank.";

  if (!v.subject) e.subject = "Select what your enquiry is about.";

  if (!v.message.trim()) e.message = "Tell us how we can help.";
  else if (v.message.trim().length < 10)
    e.message = "Please add a little more detail.";

  return e;
}

const fieldClass = (invalid) =>
  `w-full min-w-0 rounded-inner border bg-canvas px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent ${
    invalid ? "border-clay" : "border-line hover:border-line-soft"
  }`;

function Field({ label, name, error, hint, required = false, className = "", children }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={name} className="t-label block text-faint">
        {label}
        {required ? (
          <span aria-hidden className="text-accent-ice">
            {" *"}
          </span>
        ) : (
          <span className="normal-case tracking-normal"> (optional)</span>
        )}
      </label>
      <div className="mt-2">{children}</div>
      {hint && !error && <p className="mt-2 text-xs text-faint">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-2 text-xs text-clay">
          {error}
        </p>
      )}
    </div>
  );
}

export function ContactEnquiryForm() {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [failure, setFailure] = useState("");
  const summaryRef = useRef(null);

  const set = (name) => (ev) => {
    const v = ev.target.value;
    setValues((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const describedBy = (name) => (errors[name] ? `${name}-error` : undefined);

  async function onSubmit(ev) {
    ev.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFailure("");

    if (Object.keys(found).length > 0) {
      setStatus("idle");
      // Move focus to the first problem so a keyboard or screen
      // reader user is not left guessing what failed.
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }

    setStatus("sending");
    try {
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => String(v).trim() !== "")
      );

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, website: "" }),
      });

      if (res.ok) {
        setStatus("sent");
        return;
      }

      // Surface the API's own field errors where it gives them.
      const body = await res.json().catch(() => null);
      if (res.status === 400 && Array.isArray(body?.error?.details)) {
        const next = {};
        for (const d of body.error.details) next[d.field] ??= d.message;
        setErrors(next);
        setStatus("idle");
        document.getElementById(Object.keys(next)[0])?.focus();
        return;
      }

      setFailure(
        res.status === 429
          ? "Too many messages from this connection. Please try again later."
          : body?.error?.message ?? "Something went wrong at our end."
      );
      setStatus("error");
    } catch {
      setFailure("Could not reach us just now. Please check your connection.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="surface-panel p-8 text-center sm:p-12">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent-ice">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="t-h3 mt-5">Message sent</h3>
        <p className="t-body mx-auto mt-3 max-w-sm text-pretty text-body">
          Your enquiry reached us and is in the queue. We will come back to you
          at {values.email}.
        </p>
        <button
          type="button"
          onClick={() => {
            setValues(initial);
            setStatus("idle");
          }}
          className="mt-6 text-sm text-accent-ice underline-offset-4 hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  const busy = status === "sending";

  return (
    <form onSubmit={onSubmit} noValidate className="surface-panel p-6 sm:p-8 lg:p-10">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" name="name" required error={errors.name}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            value={values.name}
            onChange={set("name")}
            disabled={busy}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy("name")}
            className={fieldClass(errors.name)}
          />
        </Field>

        <Field label="Email address" name="email" required error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={200}
            value={values.email}
            onChange={set("email")}
            disabled={busy}
            aria-invalid={!!errors.email}
            aria-describedby={describedBy("email")}
            className={fieldClass(errors.email)}
          />
        </Field>

        <Field label="Phone number" name="phone" error={errors.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={40}
            value={values.phone}
            onChange={set("phone")}
            disabled={busy}
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy("phone")}
            className={fieldClass(errors.phone)}
          />
        </Field>

        <Field label="Organisation / institution" name="organisation">
          <input
            id="organisation"
            name="organisation"
            type="text"
            autoComplete="organization"
            maxLength={160}
            value={values.organisation}
            onChange={set("organisation")}
            disabled={busy}
            className={fieldClass(false)}
          />
        </Field>

        <Field label="Designation" name="designation">
          <input
            id="designation"
            name="designation"
            type="text"
            autoComplete="organization-title"
            maxLength={120}
            placeholder="e.g. Head of Department"
            value={values.designation}
            onChange={set("designation")}
            disabled={busy}
            className={fieldClass(false)}
          />
        </Field>

        <Field
          label="What is this about?"
          name="subject"
          required
          error={errors.subject}
        >
          <select
            id="subject"
            name="subject"
            value={values.subject}
            onChange={set("subject")}
            disabled={busy}
            aria-invalid={!!errors.subject}
            aria-describedby={describedBy("subject")}
            className={fieldClass(errors.subject)}
          >
            <option value="">Select…</option>
            {ENQUIRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Programme of interest" name="programme" className="sm:col-span-2">
          <select
            id="programme"
            name="programme"
            value={values.programme}
            onChange={set("programme")}
            disabled={busy}
            className={fieldClass(false)}
          >
            <option value="">No particular programme</option>
            {PROGRAMMES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Message"
          name="message"
          required
          error={errors.message}
          className="sm:col-span-2"
          hint="Batch size, timelines, what you are trying to achieve — whatever is useful."
        >
          <textarea
            id="message"
            name="message"
            rows={6}
            maxLength={5000}
            value={values.message}
            onChange={set("message")}
            disabled={busy}
            aria-invalid={!!errors.message}
            aria-describedby={describedBy("message")}
            className={`${fieldClass(errors.message)} resize-y leading-relaxed`}
          />
        </Field>
      </div>

      {/* Honeypot. Hidden from people, not from bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div
        ref={summaryRef}
        aria-live="polite"
        className={status === "error" ? "mt-6" : "sr-only"}
      >
        {status === "error" && (
          <p
            role="alert"
            className="rounded-inner border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-clay"
          >
            Your message was not sent. {failure}
            {contact.email ? (
              <>
                {" "}You can email{" "}
                <a href={`mailto:${contact.email}`} className="underline">
                  {contact.email}
                </a>{" "}
                instead.
              </>
            ) : null}
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-line pt-7">
        <Button
          as="button"
          type="submit"
          disabled={busy}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </span>
          ) : (
            "Send message"
          )}
        </Button>
        <span className="text-xs text-faint">* required</span>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        We use what you send here only to respond to your enquiry. It is not
        published, sold or used for marketing, and nothing you type is stored in
        your browser.
      </p>
    </form>
  );
}
