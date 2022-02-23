// Copy this file to .env.cjs and replace the placeholders

// All environment variables are required unless explicitly told otherwise

const fs = require("fs")
const path = require("path")

// Defines a port for the HTTP server
process.env.PORT ??= 3000

// Defines the format for log entries
process.env.LOG_FORMAT ??= "none"

// The following variables can acquired from
// https://github.com/settings/apps/your-app
// Guidance for registering an app is at
// https://probot.github.io/docs/deployment/#register-the-github-app
process.env.WEBHOOK_SECRET ??= "placeholder"
process.env.APP_ID ??= 123
process.env.CLIENT_ID ??= "placeholder"
process.env.CLIENT_SECRET ??= "placeholder"

// This private key's file can be generated and downloaded from
// https://github.com/settings/apps/your-app
// Download it to ./githubPrivateKey.pem, which is already ignored on .gitignore
// For manually encoding it, use `cat <private-key>.pem | base64 -w 0`
process.env.PRIVATE_KEY_BASE64 ??= Buffer.from(
  fs.readFileSync(path.join(__dirname, "githubPrivateKey.pem"), "utf-8"),
).toString("base64")

// Database connection details
process.env.DB_USER ??= "postgres"
process.env.DB_PASSWORD ??= "password"
process.env.DB_HOST ??= "localhost"
process.env.DB_PORT ??= 5432
process.env.DB_NAME ??= "database"
// DATABASE_URL is useful for the migrations CLI
process.env.DATABASE_URL = `${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`

// Set the key for managing the API
process.env.API_CONTROL_TOKEN ??= "secret"

/*
  NOT REQUIRED
  Since GitHub is only able to send webhook events to publicly-accessible
  internet addresses, for local development you'll need an intermediary service
  which delivers the payload to your local instance (which is not exposed to the
  internet). An EventSource-compliant (https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
  service such as https://smee.io/ can be used for that.
  The same URL used in this variable should be used as the Webhook URL in
  https://github.com/settings/apps/your-app
*/
// process.env.WEBHOOK_PROXY_URL ??= "https://smee.io/placeholder"
