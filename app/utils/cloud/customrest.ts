import { STORAGE_KEY } from "@/app/constant";
import { SyncStore } from "@/app/store/sync";
import { chunks } from "../format";

export type CustomRESTClient = ReturnType<typeof createCustomRESTClient>;

export function createCustomRESTClient(store: SyncStore) {
  const config = store.CustomREST;
  const storeKey = config.username.length === 0 ? STORAGE_KEY : config.username;
  // a proxy disable for a tmp since github doesn't need proxy url
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;

  return {
    /**
     * 异步检查方法
     *
     * @returns 如果检查成功返回 true，否则返回 false
     */
    async check() {
      try {
        const res = await fetch(this.path(`get/${storeKey}`, proxyUrl), {
          method: "GET",
          headers: this.headers(),
          mode: "cors",
        });

        console.log("[CustomREST] check", res.status, res.statusText);
        if (res.status === 200) {
          return [200].includes(res.status);
        } else {
          return false;
        }
      } catch (e) {
        console.error("[CustomREST] failed to check", e);
      }
      return false;
    },

    /**
     * 从服务器异步获取数据
     *
     * @returns 返回从服务器获取的数据字符串
     */
    async get() {
      const res = await fetch(this.path(`get/${storeKey}`, proxyUrl), {
        method: "GET",
        headers: this.headers(),
        mode: "cors",
      });

      console.log(
        "[CustomREST] get key = ",
        storeKey,
        res.status,
        res.statusText,
      );
      let resJson = {result: ""};
      if (res.status === 200) {
        resJson = (await res.json()) as { result: string };

      }
      console.log('服务器返回的信息：', resJson);
      return resJson.result;
    },

    /**
     * 设置键值对
     *
     * @param _ 占位符参数，不使用
     * @param value 要设置的值
     * @returns 返回设置的值，如果发生错误则返回空字符串
     */
    async set(_: string, value: string) {
      return fetch(this.path(`set/${storeKey}`, proxyUrl), {
        method: "POST",
        headers: this.headers(),
        body: value,
        mode: "cors",
      })
        .then((res) => {
          console.log(
            "[CustomREST] set key = ",
            storeKey,
            res.status,
            res.statusText,
          );
          return value;
        })
        .catch((error) => {
          console.error(
            "[CustomREST] set key = ",
            storeKey,
            error,
          );
          return "";
        });
    },

    headers() {
      return {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      };
    },

    /**
     * 构建给定路径的完整URL
     * 
     * 该函数接受一个路径和一个可选的代理URL作为参数，然后将这些参数与配置中的端点结合起来，
     * 生成一个完整的URL如果提供了代理URL，它会将路径和端点附加到代理URL之后
     * 
     * @param path - 需要构建的路径，不以"/"开头但以"/"结尾
     * @param proxyUrl - 可选的代理URL，如果不以"/"结尾，函数会自动添加
     * @returns 返回构建的完整URL
     */
    path(path: string, proxyUrl: string = "") {
      if (!path.endsWith("/")) {
        path += "/";
      }
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.length > 0 && !proxyUrl.endsWith("/")) {
        proxyUrl += "/";
      }

      let url;
      let pathPrefix = config.endpoint;
      if (!pathPrefix.endsWith("/")) {
        pathPrefix += "/";
      }

      // 尝试解析URL，如果失败则直接拼接
      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path;        
      }

      return url;
    },
    pathx(path: string, proxyUrl: string = "") {
        // 标准化路径，确保不以"/"开头但以"/"结尾
        path = path.startsWith("/") ? path.slice(1) : path;
        path = path.endsWith("/") ? path : path + "/";

        // 如果存在代理URL且不以"/"结尾，则添加"/"
        if (proxyUrl && !proxyUrl.endsWith("/")) {
            proxyUrl += "/";
        }

        // 标准化endpoint
        let pathPrefix = config.endpoint.endsWith("/") ? config.endpoint : `${config.endpoint}/`;

        // 直接拼接URL，不需要尝试解析
        return `${proxyUrl}${pathPrefix}${path}`;
    },
  };
}
