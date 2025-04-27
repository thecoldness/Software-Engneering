// 使用动态获取的主机名，以支持跨平台访问
const SERVER_IP = window.location.hostname;  // 自动使用当前访问的主机名
const SERVER_PORT = '3001';

export const API_BASE_URL = `http://${SERVER_IP}:${SERVER_PORT}`;
export const SOCKET_URL = API_BASE_URL;
