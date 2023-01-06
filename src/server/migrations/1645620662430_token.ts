import type { MigrationBuilder } from "node-pg-migrate";

const tokenTable = "token";

export const up = async (pgm: MigrationBuilder) => {
  // pgcrypto is a built-in extension which enables gen_random_uuid
  pgm.sql("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  pgm.createTable(tokenTable, {
    token: { type: "TEXT", notNull: true, primaryKey: true, default: pgm.func("gen_random_uuid()") },
    description: { type: "TEXT", notNull: true },
  });
};

export const down = async (pgm: MigrationBuilder) => {
  pgm.dropTable(tokenTable);
};
