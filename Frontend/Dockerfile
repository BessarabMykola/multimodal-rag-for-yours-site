FROM node:18-alpine as builder

WORKDIR /Frontend

COPY package.json ./


RUN npm install

COPY . .

RUN npm run build

FROM nginx:alpine

COPY --from=builder /Frontend/dist /usr/share/nginx/html

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]