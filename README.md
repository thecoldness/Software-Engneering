
# 环境要求
- Node.js >= 20.0
- npm >= 10.0
- docker >= 28.0 (可选)

# 部署

## Docker部署
```bash
cd ./blast
docker compose up -d
```
## 本地直接部署
```bash
cd ./blast/frontend
npm install
npm run build

cd ./blast
npm install
node server.js

cd ./blast/fronted
npm start
```