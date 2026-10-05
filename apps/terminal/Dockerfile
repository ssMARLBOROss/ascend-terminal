FROM node:22-alpine AS build
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/terminal/package.json apps/terminal/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm install

COPY apps/terminal apps/terminal
COPY packages/contracts packages/contracts

RUN npm --workspace @ascend/terminal run build

FROM nginx:1.27-alpine
COPY apps/terminal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/terminal/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
