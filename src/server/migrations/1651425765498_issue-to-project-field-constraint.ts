import type { MigrationBuilder } from "node-pg-migrate";

import {
  issueToProjectFieldRuleTable,
  projectField,
  projectFieldValue,
} from "./1645593356645_issue_to_project_field_rule";

const projectFieldBothNullableOrRequiredConstraint = "project_field_both_nullable_or_required";

export const up = async (pgm: MigrationBuilder) => {
  pgm.addConstraint(
    issueToProjectFieldRuleTable,
    projectFieldBothNullableOrRequiredConstraint,
    `CHECK (
      (${projectField} is null AND ${projectFieldValue} is null) OR
      (${projectField} is not null AND ${projectFieldValue} is not null)
    )`,
  );
};

export const down = async (pgm: MigrationBuilder) => {
  pgm.dropConstraint(issueToProjectFieldRuleTable, projectFieldBothNullableOrRequiredConstraint);
};
