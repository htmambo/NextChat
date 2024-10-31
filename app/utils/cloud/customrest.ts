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

      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path + "?endpoint=" + config.endpoint;
      }

      return url;
    },
  };
}
