const { getConfiguration, getTypescriptOverride } = require("opstooling-js-style/src/eslint/configuration");

const tsConfParams = { rootDir: __dirname };

const conf = getConfiguration({ typescript: tsConfParams });

const tsConfOverride = getTypescriptOverride(tsConfParams);

module.exports = {
  ...conf,
  overrides: [
    ...conf.overrides,
    {
      ...tsConfOverride,
      files: "{*,**,**/*}.{ts,tsx}",
      rules: {
        ...tsConfOverride.rules,
        "@typescript-eslint/explicit-module-boundary-types": "off",
      },
    },
  ],
};
