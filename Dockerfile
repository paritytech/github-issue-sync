FROM node:18 as Builder

WORKDIR /action

RUN npm i -g @vercel/ncc

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

FROM node:18-slim

COPY --from=Builder /action/dist /action

ENTRYPOINT ["node", "/action/index.js"]
