FROM node:16.14-alpine

# jq is used for Filtered Rules' expressions at runtime
RUN apk add jq

RUN mkdir /app && chown node:node /app
COPY --chown=node:node . /app

USER node
WORKDIR /app
RUN yarn install --frozen-lockfile

ARG PORT
EXPOSE $PORT
ENV PORT=\$PORT

CMD [ "sh", "-c", "yarn migrations:build && yarn migrations:up && yarn start" ]
