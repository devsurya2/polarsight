import { Router } from "express";
import { authRouter } from "../modules/auth/routes.js";
import { adminUsersRouter } from "../modules/adminUsers/routes.js";
import { rolesRouter } from "../modules/roles/routes.js";
import { programmesRouter } from "../modules/programmes/routes.js";
import { contentRouter } from "../modules/content/routes.js";
import { statisticsRouter } from "../modules/statistics/routes.js";
import { audiencesRouter } from "../modules/audiences/routes.js";
import { careerRouter } from "../modules/career/routes.js";
import { faqsRouter } from "../modules/faqs/routes.js";
import { enquiriesRouter, publicEnquiryRouter } from "../modules/enquiries/routes.js";
import { mediaRouter } from "../modules/media/routes.js";
import { auditRouter } from "../modules/audit/routes.js";
import { dashboardRouter } from "../modules/dashboard/routes.js";
import { publicRouter } from "../modules/public/routes.js";

export const apiRouter = Router();

// ── Public: no session required ──────────────────────────────
apiRouter.use("/public", publicRouter);
apiRouter.use("/public/enquiries", publicEnquiryRouter);

// ── Authentication ───────────────────────────────────────────
apiRouter.use("/auth", authRouter);

// ── Administrative: every router below enforces its own auth ─
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/admin-users", adminUsersRouter);
apiRouter.use("/roles", rolesRouter);
apiRouter.use("/programmes", programmesRouter);
apiRouter.use("/content", contentRouter);
apiRouter.use("/statistics", statisticsRouter);
apiRouter.use("/audiences", audiencesRouter);
apiRouter.use("/career", careerRouter);
apiRouter.use("/faqs", faqsRouter);
apiRouter.use("/enquiries", enquiriesRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/audit", auditRouter);
