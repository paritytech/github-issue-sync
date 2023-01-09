FROM node:16.14-alpine

# This Dockerfile takes as context the root of the application
# i.e. execute `docker build -f src/server/Dockerfile . [...]` from the
# project's root, not this directory

# jq is used for Filtered Rules' expressions at runtime
RUN apk add jq git

RUN mkdir /app && chown node:node /app
COPY --chown=node:node . /app
WORKDIR /app

# Create an empty .env.cjs file so that the commands we use in package.json
# still work as expected. This can be an empty file since the relevant
# environment variables will be provided directly to the container, not through
# .env.cjs.
RUN echo -n > /app/src/server/.env.cjs

USER node
RUN yarn install --frozen-lockfile

ARG PORT
EXPOSE $PORT
ENV PORT=$PORT

CMD [ "sh", "-c", "yarn migrations:build && yarn migrations:up && yarn start" ]
