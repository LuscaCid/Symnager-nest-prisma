-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_orders" (
    "order_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "device" TEXT NOT NULL,
    "arrived_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_by_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "clients" ("client_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_orders" ("arrived_at", "created_by_id", "description", "device", "order_id", "owner_id") SELECT "arrived_at", "created_by_id", "description", "device", "order_id", "owner_id" FROM "orders";
DROP TABLE "orders";
ALTER TABLE "new_orders" RENAME TO "orders";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
