const {
    getConfiguration,
    getTypescriptOverride,
  } = require("@eng-automation/js-style/src/eslint/configuration");
  
  const tsConfParams = { rootDir: __dirname };
  
  const conf = getConfiguration({ typescript: tsConfParams });
  
  const tsConfOverride = getTypescriptOverride(tsConfParams);
  conf.overrides.push({
    ...tsConfOverride,
    rules: { "@typescript-eslint/strict-boolean-expressions": 0 },
  });
  
  module.exports = conf;
