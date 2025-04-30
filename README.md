
# 环境要求
- Node.js >= 20.0
- npm >= 10.0
- docker >= 28.0 (可选)

# 在线访问
[点击此处以访问](http://60.205.156.71:80)


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

# 测试
## 单元测试

```bash
python -m unittest discover -s tests
```

```bash
cd blast/
npm install
npm test
```