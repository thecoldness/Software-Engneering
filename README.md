
## 环境要求
- Node.js >= 20
- npm >= 10

## 部署步骤

```bash
cd ./blast/frontend
npm install
npm run build

cd ./blast
npm install
node server.js

cd ./blast/fronted
npm start

const SERVER_IP = 'your-server-ip';  // 替换为实际服务器IP
const SERVER_PORT = '3001';          // 根据需要修改端口

// optional 
npm install -g pm2
serve -s build -l 80
pm2 start server.js --name guesscs