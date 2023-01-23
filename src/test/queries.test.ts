import { validate } from "@octokit/graphql-schema";

import {
  ADD_PROJECT_V2_ITEM_BY_ID_QUERY,
  PROJECT_FIELD_ID_QUERY,
  PROJECT_V2_QUERY,
  UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY,
} from "src/github/projectKit";

describe("Schemas", () => {
  test("PROJECT_V2_QUERY", () => {
    expect(validate(PROJECT_V2_QUERY)).toEqual([]);
  });

  test("ADD_PROJECT_V2_ITEM_BY_ID_QUERY", () => {
    expect(validate(ADD_PROJECT_V2_ITEM_BY_ID_QUERY)).toEqual([]);
  });

  test("UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY", () => {
    expect(validate(UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY)).toEqual([]);
  });

  test("PROJECT_FIELD_ID_QUERY", () => {
    expect(validate(PROJECT_FIELD_ID_QUERY)).toEqual([]);
  });
});
