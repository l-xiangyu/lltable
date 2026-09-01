import { createAxios } from '@teable/openapi';

/**
 * 浏览器端：使用相对路径 /api，这样通过 Nginx 反向代理（如嵌入若依等）时请求会发到当前域名。
 * 服务端 SSR：使用 PUBLIC_ORIGIN 或 localhost:PORT，确保 Node 能访问到后端。
 */
function getApiBaseURL(): string {
  if (typeof window !== 'undefined') {
    return '/api';
  }
  const origin = process.env.PUBLIC_ORIGIN;
  if (origin) {
    return `${origin.replace(/\/$/, '')}/api`;
  }
  return `http://localhost:${process.env.PORT ?? 3000}/api`;
}

export const getAxios = () => {
  const axios = createAxios();
  axios.defaults.baseURL = getApiBaseURL();
  return axios;
};

export const axios = getAxios();
