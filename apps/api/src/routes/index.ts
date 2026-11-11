import { Router } from "express";
import { authRouter } from "../modules/auth/routes.js";
import { adminUsersRouter } from "../modules/adminUsers/routes.js";
import { rolesRouter } from "../modules/roles/routes.js";
import { programmesRouter } from "../modules/programmes/routes.js";
import { contentRouter } from "../modules/content/routes.js";
import { pagesRouter } from "../modules/pages/routes.js";
import { jobsRouter } from "../modules/jobs/routes.js";
import {
  applicationsRouter,
  publicApplicationRouter,
} from "../modules/applications/routes.js";
import { enquiriesRouter, publicEnquiryRouter } from "../modules/enquiries/routes.js";
import { mediaRouter } from "../modules/media/routes.js";
import { settingsRouter } from "../modules/settings/routes.js";
import { auditRouter } from "../modules/audit/routes.js";
import { dashboardRouter } from "../modules/dashboard/routes.js";
import { publicRouter } from "../modules/public/routes.js";

export const apiRouter = Router();

// ── Public: no session required ──────────────────────────────
// Everything under /public is read-only and published-only, except
// the two form endpoints, which only ever create a record.
apiRouter.use("/public", publicRouter);
apiRouter.use("/public/enquiries", publicEnquiryRouter);
apiRouter.use("/public/applications", publicApplicationRouter);

// ── Authentication ───────────────────────────────────────────
apiRouter.use("/auth", authRouter);

// ── Administrative: every router below enforces its own auth ─
apiRouter.use("/dashboard", dashboardRouter);

// Website content
apiRouter.use("/pages", pagesRouter);
apiRouter.use("/content", contentRouter);
apiRouter.use("/programmes", programmesRouter);
apiRouter.use("/media", mediaRouter);

// Recruitment
apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/applications", applicationsRouter);

// Enquiries
apiRouter.use("/enquiries", enquiriesRouter);

// Administration
apiRouter.use("/admin-users", adminUsersRouter);
apiRouter.use("/roles", rolesRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/audit", auditRouter);
