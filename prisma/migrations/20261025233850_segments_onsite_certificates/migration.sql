-- AlterTable
ALTER TABLE "orders" ADD COLUMN "custom_fields" TEXT;
ALTER TABLE "orders" ADD COLUMN "scheduled_at" DATETIME;
ALTER TABLE "orders" ADD COLUMN "service_address" TEXT;

-- CreateTable
CREATE TABLE "certificates" (
    "certificate_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "verification_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VALIDO',
    "order_id" INTEGER NOT NULL,
    "issued_by_id" INTEGER,
    "performed_at" DATETIME NOT NULL,
    "next_service_at" DATETIME,
    "technician_name" TEXT NOT NULL,
    "technician_registry" TEXT,
    "equipment" TEXT NOT NULL,
    "checklist" TEXT NOT NULL,
    "products" TEXT,
    "measurements" TEXT,
    "notes" TEXT,
    "client_snapshot" TEXT NOT NULL,
    "company_snapshot" TEXT NOT NULL,
    "canceled_at" DATETIME,
    "cancel_reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificates_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("order_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "certificates_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_number_key" ON "certificates"("number");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_code_key" ON "certificates"("verification_code");

-- CreateIndex
CREATE INDEX "certificates_order_id_idx" ON "certificates"("order_id");

-- CreateIndex
CREATE INDEX "certificates_next_service_at_idx" ON "certificates"("next_service_at");

-- CreateIndex
CREATE INDEX "orders_scheduled_at_idx" ON "orders"("scheduled_at");
