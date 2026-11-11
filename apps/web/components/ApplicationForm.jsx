"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Paperclip } from "lucide-react";
import { Button } from "./ui";
import { careersPage } from "@/lib/pages";
import { contact } from "@/lib/siteConfig";

/**
 * Trainer application form.
 *
 * Posts to POST /api/public/applications, which creates a
 * TrainerApplication and stores the resume as a private asset — it is
 * excluded from the media library and can only be read back through
 * an authenticated, audited route.
 *
 * Success is reported only on a real 2xx from the API. Nothing is
 * written to localStorage: this is personal data, including a resume.
 */
const ENDPOINT = "/api/public/applications";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** The arrangements the API accepts, with the labels the page shows. */
const EMPLOYMENT_PREFERENCES = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "GUEST_TRAINER", label: "Guest Trainer" },
  { value: "INDUSTRY_EXPERT", label: "Industry Expert" },
];

/**
 * The lower bound of an experience band.
 *
 * The form asks for a band rather than an exact number, so this is
 * what the band actually guarantees. The band's own wording is sent
 * alongside it, so a reviewer sees what the candidate chose rather
 * than a figure derived from it.
 */
const EXPERIENCE_FLOOR = {
  "Less than 1 year": 0,
  "1–3 years": 1,
  "3–5 years": 3,
  "5–10 years": 5,
  "More than 10 years": 10,
};

const QUALIFICATIONS = [
  "Higher secondary",
  "Diploma",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate",
  "Other",
];

const EXPERIENCE = [
  "Less than 1 year",
  "1–3 years",
  "3–5 years",
  "5–10 years",
  "More than 10 years",
];

const initial = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  qualification: "",
  organisation: "",
  experience: "",
  expertise: "",
  position: "",
  employmentPreference: "",
  skills: "",
  certifications: "",
  linkedin: "",
  portfolio: "",
  additional: "",
  consent: false,
  // Honeypot. Hidden from people, tempting to a bot; a filled value
  // makes the API accept and discard the submission silently.
  website: "",
};

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const isUrl = (v) => /^https?:\/\/.+\..+/i.test(v);
const digits = (v) => v.replace(/\D/g, "");

function validate(values, resume) {
  const e = {};
  if (!values.fullName.trim()) e.fullName = "Enter your full name.";
  if (!values.email.trim()) e.email = "Enter your email address.";
  else if (!isEmail(values.email.trim()))
    e.email = "Enter a valid email address.";
  if (!values.phone.trim()) e.phone = "Enter your phone number.";
  else if (digits(values.phone).length < 7)
    e.phone = "Enter a valid phone number.";
  if (!values.location.trim()) e.location = "Enter your current location.";
  if (!values.qualification)
    e.qualification = "Select your highest qualification.";
  if (!values.experience) e.experience = "Select your professional experience.";
  if (!values.expertise.trim()) e.expertise = "Enter your area of expertise.";
  if (!values.position)
    e.position = "Select the position you are applying for.";
  if (!values.employmentPreference)
    e.employmentPreference = "Select an employment preference.";
  if (!values.skills.trim()) e.skills = "List your technical skills.";
  if (values.linkedin.trim() && !isUrl(values.linkedin.trim()))
    e.linkedin = "Enter a full URL, starting with https://";
  if (values.portfolio.trim() && !isUrl(values.portfolio.trim()))
    e.portfolio = "Enter a full URL, starting with https://";

  if (!resume) e.resume = "Attach your resume as a PDF.";
  else if (resume.type !== "application/pdf")
    e.resume = "The resume must be a PDF.";
  else if (resume.size > MAX_RESUME_BYTES)
    e.resume = "The PDF must be under 5 MB.";

  if (!values.consent) e.consent = "Please confirm this before submitting.";
  return e;
}

/* ── small field wrappers ─────────────────────────────────── */

const inputClass = (invalid) =>
  `w-full min-w-0 rounded-inner border bg-canvas px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent ${
    invalid ? "border-clay" : "border-line"
  }`;

function Field({
  label,
  name,
  error,
  children,
  hint,
  required = true,
  className = "",
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={name} className="block text-xs text-body">
        {label}
        {required ? (
          <span aria-hidden className="text-accent-ice">
            {" *"}
          </span>
        ) : (
          <span className="text-faint"> (optional)</span>
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

export function ApplicationForm({ positions = [] }) {
  const [values, setValues] = useState(initial);
  const [resume, setResume] = useState(null);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | failed | sent
  const [failure, setFailure] = useState(null);
  // Whether the API managed to send a confirmation email. Reported
  // honestly rather than assumed, because email may not be configured.
  const [acknowledged, setAcknowledged] = useState(false);
  const fileRef = useRef(null);

  // The published openings when there are any, the built-in list
  // otherwise — so the select is never empty.
  const options =
    positions.length > 0 ? positions : careersPage.positions.items;

  const set = (name) => (ev) => {
    const v =
      ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
    setValues((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const onFile = (ev) => {
    setResume(ev.target.files?.[0] ?? null);
    setErrors((prev) => (prev.resume ? { ...prev, resume: undefined } : prev));
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    const found = validate(values, resume);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setState("idle");
      document
        .querySelector(`[name="${Object.keys(found)[0]}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setState("sending");
    setFailure(null);
    try {
      // The chosen position, when it is a real published opening.
      const opening = positions.find((p) => p.title === values.position);

      const body = new FormData();
      body.append("fullName", values.fullName.trim());
      body.append("email", values.email.trim());
      body.append("phone", values.phone.trim());
      body.append("location", values.location.trim());
      body.append("education", values.qualification);
      body.append("currentOrganisation", values.organisation.trim());
      body.append(
        "experienceYears",
        String(EXPERIENCE_FLOOR[values.experience] ?? 0),
      );
      body.append(
        "experienceSummary",
        [`Stated experience: ${values.experience}.`, values.additional.trim()]
          .filter(Boolean)
          .join("\n\n"),
      );
      body.append("expertise", values.expertise.trim());
      body.append("technicalSkills", values.skills.trim());
      body.append("certifications", values.certifications.trim());
      body.append("appliedPosition", values.position);
      if (opening?.id) body.append("jobOpeningId", opening.id);
      body.append("employmentPreference", values.employmentPreference);
      if (values.linkedin.trim())
        body.append("linkedinUrl", values.linkedin.trim());
      if (values.portfolio.trim())
        body.append("portfolioUrl", values.portfolio.trim());
      if (values.additional.trim())
        body.append("additionalInfo", values.additional.trim());
      // Honeypot: a real person leaves this empty.
      body.append("website", values.website ?? "");
      body.append("resume", resume);

      const res = await fetch(ENDPOINT, { method: "POST", body });

      // Only a real 2xx counts as submitted.
      if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.error?.message ?? `HTTP ${res.status}`);
      }

      const result = await res.json().catch(() => ({}));
      setAcknowledged(result?.acknowledgementEmailSent === true);
      setState("sent");
    } catch (err) {
      setFailure(err?.message ?? null);
      setState("failed");
    }
  };

  if (state === "sent") {
    return (
      <div className="surface-panel p-7 sm:p-10">
        <h3 className="t-h3">Application received</h3>
        <p className="t-body mt-4 max-w-lg text-pretty text-body">
          Your application reached us. We will be in touch about the next step
          in the process.
        </p>
        <p className="t-body mt-3 max-w-lg text-pretty text-faint">
          {acknowledged
            ? "A confirmation has been sent to your email address."
            : "Please keep a note of this — we are not able to send a confirmation email at the moment."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="surface-panel relative p-6 sm:p-8 lg:p-10"
    >
      {state === "failed" && (
        <div className="flex gap-3 rounded-card border border-clay/40 bg-clay/10 p-4">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-clay"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              Your application was not submitted.
            </p>
            <p className="t-body mt-2 text-pretty text-body">
              {failure ?? "Something went wrong on our side."} Please try again.
              {contact.email ? (
                <>
                  {" "}
                  If it keeps failing, email your resume and details to{" "}
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-accent-ice underline"
                  >
                    {contact.email}
                  </a>
                  .
                </>
              ) : null}
            </p>
          </div>
        </div>
      )}

      <fieldset
        className={state === "failed" ? "mt-8 border-0 p-0" : "border-0 p-0"}
      >
        <legend className="t-label text-accent-ice">Your details</legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" name="fullName" error={errors.fullName}>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              value={values.fullName}
              onChange={set("fullName")}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              className={inputClass(errors.fullName)}
            />
          </Field>

          <Field label="Email address" name="email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={set("email")}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={inputClass(errors.email)}
            />
          </Field>

          <Field label="Phone number" name="phone" error={errors.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={set("phone")}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className={inputClass(errors.phone)}
            />
          </Field>

          <Field
            label="Current location"
            name="location"
            error={errors.location}
          >
            <input
              id="location"
              name="location"
              type="text"
              placeholder="City, state"
              value={values.location}
              onChange={set("location")}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? "location-error" : undefined}
              className={inputClass(errors.location)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10 border-0 p-0">
        <legend className="t-label text-accent-ice">Background</legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="Highest educational qualification"
            name="qualification"
            error={errors.qualification}
          >
            <select
              id="qualification"
              name="qualification"
              value={values.qualification}
              onChange={set("qualification")}
              aria-invalid={!!errors.qualification}
              aria-describedby={
                errors.qualification ? "qualification-error" : undefined
              }
              className={inputClass(errors.qualification)}
            >
              <option value="">Select…</option>
              {QUALIFICATIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Current organisation"
            name="organisation"
            required={false}
            error={errors.organisation}
          >
            <input
              id="organisation"
              name="organisation"
              type="text"
              autoComplete="organization"
              value={values.organisation}
              onChange={set("organisation")}
              className={inputClass(false)}
            />
          </Field>

          <Field
            label="Professional experience"
            name="experience"
            error={errors.experience}
          >
            <select
              id="experience"
              name="experience"
              value={values.experience}
              onChange={set("experience")}
              aria-invalid={!!errors.experience}
              aria-describedby={
                errors.experience ? "experience-error" : undefined
              }
              className={inputClass(errors.experience)}
            >
              <option value="">Select…</option>
              {EXPERIENCE.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Area of expertise"
            name="expertise"
            error={errors.expertise}
          >
            <input
              id="expertise"
              name="expertise"
              type="text"
              placeholder="e.g. security operations, AI security"
              value={values.expertise}
              onChange={set("expertise")}
              aria-invalid={!!errors.expertise}
              aria-describedby={
                errors.expertise ? "expertise-error" : undefined
              }
              className={inputClass(errors.expertise)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10 border-0 p-0">
        <legend className="t-label text-accent-ice">The role</legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="Position applying for"
            name="position"
            error={errors.position}
          >
            <select
              id="position"
              name="position"
              value={values.position}
              onChange={set("position")}
              aria-invalid={!!errors.position}
              aria-describedby={errors.position ? "position-error" : undefined}
              className={inputClass(errors.position)}
            >
              <option value="">Select…</option>
              {options.map((p) => (
                <option key={p.id ?? p.title} value={p.title}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Employment preference"
            name="employmentPreference"
            error={errors.employmentPreference}
          >
            <select
              id="employmentPreference"
              name="employmentPreference"
              value={values.employmentPreference}
              onChange={set("employmentPreference")}
              aria-invalid={!!errors.employmentPreference}
              aria-describedby={
                errors.employmentPreference
                  ? "employmentPreference-error"
                  : undefined
              }
              className={inputClass(errors.employmentPreference)}
            >
              <option value="">Select…</option>
              {EMPLOYMENT_PREFERENCES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Technical skills"
            name="skills"
            error={errors.skills}
            className="sm:col-span-2"
            hint="Comma separated is fine."
          >
            <textarea
              id="skills"
              name="skills"
              rows={3}
              value={values.skills}
              onChange={set("skills")}
              aria-invalid={!!errors.skills}
              aria-describedby={errors.skills ? "skills-error" : undefined}
              className={`${inputClass(errors.skills)} resize-y`}
            />
          </Field>

          <Field
            label="Certifications"
            name="certifications"
            required={false}
            className="sm:col-span-2"
          >
            <textarea
              id="certifications"
              name="certifications"
              rows={2}
              value={values.certifications}
              onChange={set("certifications")}
              className={`${inputClass(false)} resize-y`}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-10 border-0 p-0">
        <legend className="t-label text-accent-ice">Links and resume</legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            label="LinkedIn profile"
            name="linkedin"
            required={false}
            error={errors.linkedin}
          >
            <input
              id="linkedin"
              name="linkedin"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={values.linkedin}
              onChange={set("linkedin")}
              aria-invalid={!!errors.linkedin}
              aria-describedby={errors.linkedin ? "linkedin-error" : undefined}
              className={inputClass(errors.linkedin)}
            />
          </Field>

          <Field
            label="GitHub or portfolio"
            name="portfolio"
            required={false}
            error={errors.portfolio}
          >
            <input
              id="portfolio"
              name="portfolio"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={values.portfolio}
              onChange={set("portfolio")}
              aria-invalid={!!errors.portfolio}
              aria-describedby={
                errors.portfolio ? "portfolio-error" : undefined
              }
              className={inputClass(errors.portfolio)}
            />
          </Field>

          <Field
            label="Resume"
            name="resume"
            error={errors.resume}
            className="sm:col-span-2"
            hint="PDF only, up to 5 MB."
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                id="resume"
                name="resume"
                type="file"
                accept="application/pdf,.pdf"
                onChange={onFile}
                aria-invalid={!!errors.resume}
                aria-describedby={errors.resume ? "resume-error" : undefined}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink transition-colors hover:border-accent"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Choose PDF
              </button>
              <span className="min-w-0 break-all text-xs text-faint">
                {resume ? resume.name : "No file selected"}
              </span>
            </div>
          </Field>

          <Field
            label="Additional information"
            name="additional"
            required={false}
            className="sm:col-span-2"
          >
            <textarea
              id="additional"
              name="additional"
              rows={4}
              value={values.additional}
              onChange={set("additional")}
              className={`${inputClass(false)} resize-y`}
            />
          </Field>
        </div>
      </fieldset>

      {/* Privacy notice */}
      <div className="mt-10 rounded-card border border-line bg-canvas p-5">
        <h3 className="text-sm font-medium text-ink">
          How we handle your data
        </h3>
        <p className="t-body mt-3 text-pretty text-body">
          The details and resume you submit are used only to assess your
          application. They are not published, sold or shared with third parties
          for marketing. Nothing you type here is stored in your browser.
          {contact.email ? (
            <>
              {" "}
              If you want your application removed, email{" "}
              <a
                href={`mailto:${contact.email}`}
                className="text-accent-ice underline"
              >
                {contact.email}
              </a>{" "}
              and we will delete it.
            </>
          ) : (
            " You can ask us to delete your application at any time."
          )}
        </p>

        <label htmlFor="consent" className="mt-5 flex gap-3 text-sm text-body">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            checked={values.consent}
            onChange={set("consent")}
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="min-w-0 text-pretty">
            I agree to PolarSight processing these details to assess my
            application.
          </span>
        </label>
        {errors.consent && (
          <p id="consent-error" role="alert" className="mt-2 text-xs text-clay">
            {errors.consent}
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button
          as="button"
          type="submit"
          disabled={state === "sending"}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "sending" ? "Submitting…" : "Submit application"}
        </Button>
        <span className="text-xs text-faint">* required</span>
      </div>

      {/* Honeypot: positioned off-screen rather than display:none, so
          a bot that checks for visibility still fills it in. Never
          shown to a person, and never focusable by keyboard. */}
      <div
        aria-hidden
        className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden"
      >
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={set("website")}
        />
      </div>
    </form>
  );
}
