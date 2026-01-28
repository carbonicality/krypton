self.__uv$config = {
  prefix: '/uv/service/',
  bare: '/bare/',
  encodeUrl: (url) => encodeURIComponent(url),
  decodeUrl: (url) => decodeURIComponent(url),
  handler: '/uv/uv.handler.js',
  client: '/uv/uv.client.js',
  bundle: '/uv/uv.bundle.js',
  config: '/uv/uv.config.js',
  sw: '/uv/uv.sw.js',
};