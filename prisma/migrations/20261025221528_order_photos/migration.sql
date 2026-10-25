-- CreateTable
CREATE TABLE "order_photos" (
    "photo_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "original_name" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "user_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_photos_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("order_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "order_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "order_photos_file_name_key" ON "order_photos"("file_name");

-- CreateIndex
CREATE INDEX "order_photos_order_id_idx" ON "order_photos"("order_id");
