import type { MigrationBuilder } from "node-pg-migrate";

export const issueToProjectFieldRuleTable = "issue_to_project_field_rule";
export const projectField = "project_field";
export const projectFieldValue = "project_field_value";

export const up = (pgm: MigrationBuilder) => {
  pgm.createTable(issueToProjectFieldRuleTable, {
    id: { type: "SERIAL", primaryKey: true },
    github_owner: { type: "TEXT", notNull: true },
    github_name: { type: "TEXT", notNull: true },
    project_number: { type: "INT", notNull: true },
    [projectField]: { type: "TEXT", notNull: true },
    [projectFieldValue]: { type: "TEXT", notNull: true },
    filter: { type: "TEXT" },
  });
};

export const down = (pgm: MigrationBuilder) => {
  pgm.dropTable(issueToProjectFieldRuleTable);
};
