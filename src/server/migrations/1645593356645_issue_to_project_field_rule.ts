import type { MigrationBuilder } from "node-pg-migrate"

const issueToProjectFieldRuleTable = "issue_to_project_field_rule"
export const up = async (pgm: MigrationBuilder) => {
  pgm.createTable(issueToProjectFieldRuleTable, {
    id: { type: "SERIAL", primaryKey: true },
    github_owner: { type: "TEXT", notNull: true },
    github_name: { type: "TEXT", notNull: true },
    project_number: { type: "INT", notNull: true },
    project_field: { type: "TEXT", notNull: true },
    project_field_value: { type: "TEXT", notNull: true },
    filter: { type: "TEXT" },
  })
}

export const down = async (pgm: MigrationBuilder) => {
  pgm.dropTable(issueToProjectFieldRuleTable)
}
