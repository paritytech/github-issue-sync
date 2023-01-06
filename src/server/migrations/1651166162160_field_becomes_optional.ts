import type { MigrationBuilder } from "node-pg-migrate";

import {
  issueToProjectFieldRuleTable,
  projectField,
  projectFieldValue,
} from "./1645593356645_issue_to_project_field_rule";

export const up = (pgm: MigrationBuilder) => {
  pgm.alterColumn(issueToProjectFieldRuleTable, projectField, { allowNull: true });
  pgm.alterColumn(issueToProjectFieldRuleTable, projectFieldValue, { allowNull: true });
};

export const down = (pgm: MigrationBuilder) => {
  pgm.sql(`
    DELETE FROM ${issueToProjectFieldRuleTable}
    WHERE
      ${projectField} IS NULL
      OR ${projectFieldValue} IS NULL
  `);
  pgm.alterColumn(issueToProjectFieldRuleTable, projectField, { allowNull: false });
  pgm.alterColumn(issueToProjectFieldRuleTable, projectFieldValue, { allowNull: false });
};
