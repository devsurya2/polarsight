# File upload security

Two upload paths exist. Both treat the file as hostile until proven
otherwise, and both run the same pipeline:

```
 bytes ──▶ policy checks ──▶ private tier (quarantine) ──▶ clamd ──┬─ clean ──▶ release (public media) / keep private (resume), CLEAN
                                                                   ├─ infected ──▶ destroyed, REJECTED, audited, 400 to the client
                                                                   └─ error ──▶ stays quarantined, SCAN_FAILED, nothing can use it
```

Implementation: `apps/api/src/lib/storage.ts` (tiers, policy),
`lib/pdf.ts`, `lib/zipcheck.ts`, `lib/scan.ts` (clamd client),
`lib/quarantine.ts` (pipeline), `jobs/rescan.ts`, `jobs/cleanup.ts`.

## Resumes — `POST /api/public/applications`

Untrusted boundary: anyone on the internet, no account.

| Layer | Rule | Where |
|---|---|---|
| Transport | One file, field `resume`, ≤ 40 form fields, 20 KB per field | multer limits |
| Size | `RESUME_MAX_BYTES` (default 5 MB), refused by the parser with **413** before the body is buffered in full | multer `fileSize` |
| Rate | 5 submissions per hour per address; one application per address per opening per 30 days | `applicationLimiter`, duplicate check |
| File name | Exactly one extension and it is `.pdf`; no `..`, `/`, `\` or NUL. The name is **never** used on disk | `validateResume` |
| Declared type | Must be `application/pdf` (or absent) | `validateResume` |
| Magic bytes | `%PDF-` | `sniffMime` |
| Structure | Header version, end-of-file marker, objects, cross-reference section or stream | `inspectPdf` |
| Active content | Refuses documents containing scripting, launch, embedded-file, rich-media, form, import/submit, remote-goto or encryption dictionaries. Names are normalised (hex escapes decoded) and **FlateDecode streams are inflated under bounds** (16 MB per stream, 64 MB total, 2 000 streams) so object streams are inspected too; exceeding a bound is itself a rejection | `inspectPdf` |
| Storage | Random 32-hex key, written `0600` with `wx` (no overwrite) into `STORAGE_PRIVATE_DIR`, which no route serves | `LocalDriver.put` |
| Scan | clamd `INSTREAM` with timeout; verdict, version and time persisted on the asset | `scanBuffer` |
| Download | `GET /applications/:id/resume`: session + `application:read` + re-authentication + `scanStatus = CLEAN`; served as `attachment`, `application/pdf`, `nosniff`, sandbox CSP, `no-store`; audited | applications routes |
| Rescan | `POST /applications/:id/resume/rescan`; `npm run media:rescan` for the backlog | |
| Deletion | Deleting an application deletes the file; `npm run media:cleanup` removes orphans, rejected leftovers and quarantined files older than `QUARANTINE_MAX_AGE_DAYS` (30) that no application references | |

Not accepted, by design: DOCX and every other document format, images,
archives of any kind, anything with two extensions. If another format
is needed later it gets its own reviewed policy, not an addition to the
allowlist.

## Media library — `POST /api/media`

Authenticated (`media:write`), 40 uploads per 15 minutes, up to 10
files per request, 64 MB hard cap, per-type caps (images 8 MB, SVG
2 MB, video 64 MB, documents 16 MB).

| Type | Checks |
|---|---|
| PNG, JPEG, GIF, WebP, AVIF, MP4, WebM | Magic bytes; declared type must agree |
| SVG | Numeric entities decoded, then refused if it contains script, event handlers, `javascript:`, `foreignObject`, `iframe/embed/object`, `set/animate`, remote `use` or `data:` hrefs |
| PDF | Same structural and active-content inspection as resumes |
| DOCX | Zip central directory parsed **without extraction**: ≤ 500 entries, ≤ 64 MB declared total, per-entry ratio ≤ 100, no `..`/absolute/drive paths, no nested archive or executable names, must contain `[Content_Types].xml` and `word/document.xml`, no VBA/binary parts |

Every file is quarantined and scanned; only a CLEAN file is moved to
the public tier and given a URL. A file whose scan failed exists in the
library flagged "Awaiting scan", has no URL and **cannot be referenced**
by a programme, gallery, page or setting (`USABLE_MEDIA` in
`lib/quarantine.ts`). Deleting media requires re-authentication and is
refused while a published record uses the file.

Served files carry `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox`, so even a
browser that opens one directly cannot run anything from it.

## Decompression bombs

No archive is ever extracted by the API. DOCX is judged on its
directory alone; PDF stream inflation is bounded and a stream that
expands past the bound rejects the file. clamd applies its own
`MaxFileSize`/`MaxScanSize`/`MaxRecursion` limits; keep the daemon's
defaults or lower them.

## Scanner deployment

* `CLAMAV_HOST`/`CLAMAV_PORT` point at clamd over TCP; keep it on the
  loopback or a private network (the compose service binds
  `127.0.0.1:3310`). `CLAMAV_TIMEOUT_MS` (30 s) bounds a scan.
* Run clamd in its own container with no outbound network except
  signature updates (`freshclam`), a memory limit, and no shared
  volumes with the API. The API sends bytes over the socket; nothing is
  written to a path the scanner can reach.
* Production refuses to start without `CLAMAV_HOST`. Development
  without it keeps resumes quarantined (never downloadable) and
  releases public media flagged `SCAN_SKIPPED`.
* Scanner health, version and the count of files awaiting a verdict are
  on Settings → Integrations.

## Verifying the pipeline

`npm run test:security` exercises every rejection above with synthetic
files and checks the stored resume is unreachable from `/media`, lives
in the private tier under a random key, and downloads only when CLEAN
(or is refused with 409 when no scanner is reachable). To verify
detection end to end, submit the standard antivirus test file through
the careers form on a staging stack with clamd running: the upload must
be refused and `upload.malware_rejected` must appear in the audit log.
Do this on staging, never on production.
