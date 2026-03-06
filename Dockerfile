FROM node:20

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/src/main.js"]

# docker build -t web-system-backend .
# docker run -p 3000:3000 -e DATABASE_URL="postgresql://postgres:1234@host.docker.internal:5432/appdb" web-system-backend