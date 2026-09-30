-- CreateTable
CREATE TABLE "complaint" (
    "id" VARCHAR(64) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sender_name" TEXT NOT NULL,
    "sender_species" TEXT,
    "reply_email" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complaint_pkey" PRIMARY KEY ("id"),
    -- Defence in depth (hand-written; Prisma does not model CHECK constraints): this table
    -- is the public wall, so a private complaint or an email address can never land in it.
    CONSTRAINT "complaint_public_only" CHECK ("visibility" = 'public' AND "reply_email" IS NULL),
    CONSTRAINT "complaint_status_known" CHECK ("status" IN ('pending', 'approved', 'rejected', 'deleted'))
);

-- CreateTable
CREATE TABLE "submission_log" (
    "id" BIGSERIAL NOT NULL,
    "client_key" CHAR(64) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submission_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_status_submitted_idx" ON "complaint"("status", "submitted_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "submission_log_client_idx" ON "submission_log"("client_key", "submitted_at");

-- CreateIndex
CREATE INDEX "submission_log_submitted_idx" ON "submission_log"("submitted_at");
