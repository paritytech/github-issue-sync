import type { MigrationBuilder } from "node-pg-migrate"

const issueToProjectFieldRuleTable = "issue_to_project_field_rule"
const projectField = "project_field"
const projectFieldValue = "project_field_value"

export const up = async (pgm: MigrationBuilder) => {
  pgm.alterColumn(issueToProjectFieldRuleTable, projectField, {
    allowNull: true,
  })
  pgm.alterColumn(issueToProjectFieldRuleTable, projectFieldValue, {
    allowNull: true,
  })
}

export const down = async (pgm: MigrationBuilder) => {
  pgm.sql(`
    DELETE FROM ${issueToProjectFieldRuleTable} 
    WHERE 
      ${projectField} IS NULL 
      OR ${projectFieldValue} IS NULL
  `)
  pgm.alterColumn(issueToProjectFieldRuleTable, projectField, {
    allowNull: false,
  })
  pgm.alterColumn(issueToProjectFieldRuleTable, projectFieldValue, {
    allowNull: false,
  })
}
